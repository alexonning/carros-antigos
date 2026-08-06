/* =====================================================================
   CADASTRO PÚBLICO DE VISITANTES
   Grava direto no Supabase como origem 'visitante'.
   Não faz login, não lê dados de ninguém — só insere.
   ===================================================================== */

const BUCKET = 'carros-fotos';
let sb = null;
let photoItems = [];
let aVenda = false;

const $ = id => document.getElementById(id);
const hide = el => { el.style.display = 'none'; };
const show = (el, d = 'block') => { el.style.display = d; };

function toast(text, type = ''){
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = text;
  $('toastWrap').appendChild(t);
  setTimeout(() => t.remove(), 3800);
}

function setBusy(btn, busy, textBusy){
  if (!btn) return;
  if (busy){
    btn.dataset.label = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>${textBusy || ''}`;
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.label || btn.textContent;
  }
}

function showMsg(type, text){
  const el = $('formMsg');
  el.textContent = text;
  el.className = 'form-msg ' + type;
  if (type === 'err') el.scrollIntoView({ behavior:'smooth', block:'center' });
}

/* ---------------- boot ---------------- */
(function boot(){
  const cfg = window.SUPABASE_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY){
    hide($('bootView')); show($('cfgError'), 'flex'); return;
  }
  try {
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  } catch (_){
    hide($('bootView')); show($('cfgError'), 'flex'); return;
  }
  hide($('bootView'));
  show($('publicView'));
})();

/* ---------------- toggle à venda ---------------- */
function setVenda(v){
  aVenda = v;
  $('fVendaSim').setAttribute('aria-pressed', v);
  $('fVendaNao').setAttribute('aria-pressed', !v);
}
$('fVendaSim').addEventListener('click', () => setVenda(true));
$('fVendaNao').addEventListener('click', () => setVenda(false));

/* ---------------- máscara de telefone ---------------- */
attachPhoneMask($('fTelefone'));

/* ---------------- limites do campo de ano ---------------- */
attachAnoLimits($('fAno'), $('anoHint'));

/* ---------------- fotos ---------------- */
const uploadZone = $('uploadZone');
const fileInput = $('fFotos');

uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); fileInput.click(); }
});
['dragenter','dragover'].forEach(ev =>
  uploadZone.addEventListener(ev, e => { e.preventDefault(); uploadZone.classList.add('drag'); }));
['dragleave','drop'].forEach(ev =>
  uploadZone.addEventListener(ev, e => { e.preventDefault(); uploadZone.classList.remove('drag'); }));
uploadZone.addEventListener('drop', e => addFiles(e.dataTransfer.files));
fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });

function addFiles(files){
  [...files].filter(f => f.type.startsWith('image/')).forEach(file => {
    const reader = new FileReader();
    reader.onload = () => { photoItems.push({ file, preview: reader.result }); renderPreviews(); };
    reader.readAsDataURL(file);
  });
}
function renderPreviews(){
  $('previews').innerHTML = photoItems.map((p,i) => `
    <div class="preview">
      <img src="${p.preview}" alt="Foto ${i+1}">
      <button type="button" data-remove="${i}" aria-label="Remover foto ${i+1}">✕</button>
    </div>`).join('');
}
$('previews').addEventListener('click', e => {
  const btn = e.target.closest('[data-remove]');
  if (!btn) return;
  photoItems.splice(Number(btn.dataset.remove), 1);
  renderPreviews();
});

async function uploadPhotos(carId, files){
  const paths = [];
  for (const file of files){
    const blob = await compressImage(file);
    const path = `${carId}/${crypto.randomUUID()}.jpg`;
    const { error } = await sb.storage.from(BUCKET)
      .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw new Error('Upload da foto falhou: ' + error.message);
    paths.push(path);
  }
  return paths;
}

/* ---------------- submit ---------------- */
$('carForm').addEventListener('submit', async e => {
  e.preventDefault();
  const placa = $('fPlaca').value.trim().toUpperCase();
  const ano = parseInt($('fAno').value, 10);
  const modelo = $('fModelo').value.trim();
  const cor = $('fCor').value.trim();
  const proprietario = $('fProprietario').value.trim();
  const cidade = $('fCidade').value.trim();
  const telefone = $('fTelefone').value.trim();
  const descricao = $('fDesc').value.trim();

  if (!placa || !modelo || !cor || !ano || !proprietario || !cidade || !telefone){
    showMsg('err','✕ Preencha todos os campos obrigatórios (*).'); return;
  }
  if (!isValidAno(ano)){
    showMsg('err', `✕ O ano deve estar entre ${ANO_MIN} e ${anoMax()}.`);
    $('fAno').focus(); return;
  }
  if (proprietario.length < MIN_PROPRIETARIO){
    showMsg('err', `✕ O nome do proprietário deve ter no mínimo ${MIN_PROPRIETARIO} caracteres.`);
    $('fProprietario').focus(); return;
  }
  if (!isValidPhone(telefone)){
    showMsg('err','✕ Telefone inválido. Use DDD + número, ex.: (46) 99999-9999.'); return;
  }

  const btn = $('submitBtn');
  setBusy(btn, true, 'Enviando…');

  try {
    const carId = crypto.randomUUID();
    const fotos = await uploadPhotos(carId, photoItems.map(p => p.file));

    const { error } = await sb.from('carros').insert({
      id: carId, placa, ano, modelo, cor,
      dono: proprietario,          // "dono" = apelido/nome exibido; usa o proprietário
      proprietario, cidade, telefone,
      a_venda: aVenda, descricao, fotos,
      presente: false, origem: 'visitante'
    });
    if (error) throw error;

    hide($('publicView'));
    show($('successView'), 'flex');
    window.scrollTo({ top:0, behavior:'smooth' });
  } catch (err){
    const dup = /duplicate key|unique/i.test(err.message || '');
    showMsg('err', '✕ ' + (dup
      ? `A placa ${placa} já está cadastrada. Procure a organização se precisar corrigir algo.`
      : (err.message || 'Não foi possível enviar. Tente novamente.')));
  } finally {
    setBusy(btn, false);
  }
});

/* ---------------- cadastrar outro ---------------- */
$('newAnother').addEventListener('click', () => {
  $('carForm').reset();
  photoItems = []; renderPreviews(); setVenda(false);
  $('formMsg').className = 'form-msg';
  hide($('successView'));
  show($('publicView'));
  window.scrollTo({ top:0, behavior:'smooth' });
});
