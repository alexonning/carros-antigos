/* =====================================================================
   ENCONTRO DE CARROS ANTIGOS — Gestão de Presença
   Persistência: Supabase (PostgreSQL + Storage + Auth + Realtime)
   ===================================================================== */

const BUCKET = 'carros-fotos';
const LS_KEY = 'carros_supabase_cfg';

let sb = null;                 // cliente supabase
let cars = [];                 // cache local da tabela
let editingId = null;          // id do carro em edição
let modalCarId = null;
let presenceFilter = 'all';
let photoItems = [];           // fotos do formulário
let realtimeChannel = null;

/* ---------------- helpers de UI ---------------- */
const $ = id => document.getElementById(id);
const show = (el, display = 'block') => { el.style.display = display; };
const hide = el => { el.style.display = 'none'; };

function toast(text, type = ''){
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = text;
  $('toastWrap').appendChild(t);
  setTimeout(() => t.remove(), 3800);
}

const norm = s => (s ?? '').toString().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'');

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

const CAR_PLACEHOLDER = `<svg viewBox="0 0 64 64" fill="none" stroke="#5A4A38" stroke-width="2.4" aria-hidden="true">
  <path d="M8 40h48M10 40v6h6l2-4h28l2 4h6v-6M14 40l4-12c1-3 3-4 6-4h16c3 0 5 1 6 4l4 12"/>
  <circle cx="20" cy="46" r="4"/><circle cx="44" cy="46" r="4"/>
</svg>`;

/* =====================================================================
   1. CONFIGURAÇÃO / BOOT
   ===================================================================== */
function readConfig(){
  const fromFile = window.SUPABASE_CONFIG || {};
  if (fromFile.SUPABASE_URL && fromFile.SUPABASE_ANON_KEY) return fromFile;
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (saved?.SUPABASE_URL && saved?.SUPABASE_ANON_KEY) return saved;
  } catch (_) {}
  return null;
}

async function boot(){
  const cfg = readConfig();
  if (!cfg){
    hide($('bootView'));
    show($('setupView'), 'flex');
    return;
  }
  try {
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  } catch (err){
    hide($('bootView'));
    show($('setupView'), 'flex');
    showErr($('setupError'), 'Não foi possível conectar. Confira a URL e a chave.');
    return;
  }

  const { data } = await sb.auth.getSession();
  hide($('bootView'));
  if (data?.session) await enterApp();
  else show($('loginView'), 'flex');

  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') leaveApp();
  });
}

function showErr(el, msg){ el.textContent = '✕ ' + msg; el.classList.add('show'); }
function clearErr(el){ el.textContent = ''; el.classList.remove('show'); }

$('setupForm').addEventListener('submit', e => {
  e.preventDefault();
  const url = $('cfgUrl').value.trim().replace(/\/+$/,'');
  const key = $('cfgKey').value.trim();
  if (!url.startsWith('http') || key.length < 20){
    showErr($('setupError'), 'Preencha a URL e a chave corretamente.'); return;
  }
  localStorage.setItem(LS_KEY, JSON.stringify({SUPABASE_URL:url, SUPABASE_ANON_KEY:key}));
  location.reload();
});

$('resetCfgBtn').addEventListener('click', () => {
  localStorage.removeItem(LS_KEY);
  location.reload();
});

/* =====================================================================
   2. AUTENTICAÇÃO
   ===================================================================== */
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  clearErr($('loginError'));
  const email = $('loginEmail').value.trim();
  const password = $('loginPass').value;
  const btn = $('loginBtn');
  setBusy(btn, true, 'Entrando…');

  const { error } = await sb.auth.signInWithPassword({ email, password });
  setBusy(btn, false);

  if (error){
    const msg = /invalid login/i.test(error.message)
      ? 'E-mail ou senha inválidos.'
      : error.message;
    showErr($('loginError'), msg);
    return;
  }
  hide($('loginView'));
  await enterApp();
});

$('logoutBtn').addEventListener('click', async () => {
  await sb.auth.signOut();
});

async function enterApp(){
  hide($('loginView'));
  show($('appView'));
  await loadCars();
  subscribeRealtime();
}

function leaveApp(){
  if (realtimeChannel){ sb.removeChannel(realtimeChannel); realtimeChannel = null; }
  cars = []; resetForm(); closeModal();
  hide($('appView'));
  $('loginForm').reset();
  show($('loginView'), 'flex');
}

/* =====================================================================
   3. DADOS
   ===================================================================== */
function photoUrl(path){
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function loadCars(){
  renderSkeleton();
  const { data, error } = await sb
    .from('carros')
    .select('*')
    .order('criado_em', { ascending: false });

  if (error){
    $('results').innerHTML = '';
    toast('Erro ao carregar: ' + error.message, 'err');
    return;
  }
  cars = data || [];
  render();
}

function subscribeRealtime(){
  if (realtimeChannel) return;
  realtimeChannel = sb.channel('carros-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'carros' }, () => {
      loadCarsQuiet();
    })
    .subscribe();
}

async function loadCarsQuiet(){
  const { data, error } = await sb
    .from('carros').select('*').order('criado_em', { ascending: false });
  if (!error){ cars = data || []; render(); }
}

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

async function removePhotos(paths){
  if (!paths.length) return;
  await sb.storage.from(BUCKET).remove(paths);
}

/* =====================================================================
   4. RENDERIZAÇÃO
   ===================================================================== */
/* busca genérica: placa ou nome do proprietário (inclui o apelido "dono") */
function filteredCars(){
  const q = norm($('searchInput').value.trim());
  const achados = cars.filter(c => {
    if (presenceFilter === 'present' && !c.presente) return false;
    if (presenceFilter === 'absent' && c.presente) return false;
    if (!q) return true;
    return [c.placa, c.proprietario, c.dono].some(v => norm(v).includes(q));
  });
  return sortCars(achados);
}

/* ordena pela ordem de cadastro ou pela ordem de presença.
   Quem ainda não confirmou presença fica sempre no fim da lista. */
function sortCars(list){
  const mode = $('sortOrder').value;
  const cad = c => ordemCadastroMap.get(c.id) ?? Number.MAX_SAFE_INTEGER;
  const arr = [...list];

  if (mode === 'cad-asc' || mode === 'cad-desc'){
    arr.sort((a,b) => cad(a) - cad(b));
    if (mode === 'cad-desc') arr.reverse();
    return arr;
  }

  const pres = c => ordemPresencaMap.get(c.id) ?? Infinity;
  arr.sort((a,b) => {
    const pa = pres(a), pb = pres(b);
    if (pa === Infinity && pb === Infinity) return cad(a) - cad(b);
    if (pa === Infinity) return 1;
    if (pb === Infinity) return -1;
    return mode === 'pres-asc' ? pa - pb : pb - pa;
  });
  return arr;
}

/* ---------- ordem de cadastro e ordem de presença ----------
   Ambas são derivadas das datas, então não dependem do banco:
   criado_em  -> 1º cadastrado, 2º cadastrado…
   checkin_em -> 1º presente,   2º presente…               */
let ordemCadastroMap = new Map();
let ordemPresencaMap = new Map();

const ts = v => { const t = v ? new Date(v).getTime() : NaN;
                  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t; };

function computeOrders(){
  ordemCadastroMap = new Map(
    [...cars]
      .sort((a,b) => ts(a.criado_em) - ts(b.criado_em))
      .map((c,i) => [c.id, i+1]));

  ordemPresencaMap = new Map(
    cars.filter(c => c.presente)
      .sort((a,b) => (ts(a.checkin_em) - ts(b.checkin_em)) || (ts(a.criado_em) - ts(b.criado_em)))
      .map((c,i) => [c.id, i+1]));
}

function ordemBadges(c){
  const cad = ordemCadastroMap.get(c.id);
  const pre = ordemPresencaMap.get(c.id);
  if (!cad && !pre) return '';
  return `<div class="ordem-badges">
      ${cad ? `<span class="ord-badge ord-cad">${cad}º cadastrado</span>` : ''}
      ${pre ? `<span class="ord-badge ord-pre">${pre}º presente</span>` : ''}
    </div>`;
}

function renderSkeleton(){
  $('results').innerHTML = Array.from({length:4}, () => '<div class="skeleton"></div>').join('');
  hide($('emptyState'));
}

function updateCount(){
  const present = cars.filter(c => c.presente).length;
  $('countBadge').innerHTML =
    `<span class="live-dot"></span><strong>${present}</strong> presentes · ${cars.length} cadastrados`;
}

function render(){
  computeOrders();
  const list = filteredCars();
  updateCount();
  updateGenInfo(list.length);
  renderRaffle();
  $('emptyState').style.display = list.length ? 'none' : 'block';
  $('results').innerHTML = list.map(c => `
    <article class="car-card">
      <div class="car-photo">
        ${c.fotos?.length
          ? `<img src="${photoUrl(c.fotos[0])}" alt="Foto de ${escapeHtml(c.modelo)}" loading="lazy">`
          : CAR_PLACEHOLDER}
        <span class="presence-flag ${c.presente ? 'on' : 'off'}">${c.presente ? 'Presente' : 'Aguardando'}</span>
        ${c.a_venda ? '<span class="sale-flag">À venda</span>' : ''}
        ${c.fotos?.length > 1 ? `<span class="photo-count">${c.fotos.length} fotos</span>` : ''}
      </div>
      <div class="car-body">
        <span class="plate">${escapeHtml(c.placa)}</span>
        ${ordemBadges(c)}
        <div class="car-model">${escapeHtml(c.modelo)} · ${c.ano}</div>
        <div class="car-meta">
          <span><b>Cor:</b> ${escapeHtml(c.cor)}</span>
          <span><b>Dono:</b> ${escapeHtml(c.dono)}</span>
          ${c.cidade ? `<span><b>Cidade:</b> ${escapeHtml(c.cidade)}</span>` : ''}
        </div>
        <div class="car-actions">
          <button class="btn-sm ${c.presente ? 'btn-checkout' : 'btn-checkin'}" data-presence="${c.id}">
            ${c.presente ? 'Desfazer check-in' : 'Confirmar presença'}
          </button>
          <button class="btn-sm btn-detail" data-detail="${c.id}">Detalhes</button>
        </div>
      </div>
    </article>`).join('');
}

$('results').addEventListener('click', e => {
  const p = e.target.closest('[data-presence]');
  if (p) return togglePresence(p.dataset.presence, p);
  const d = e.target.closest('[data-detail]');
  if (d) return openModal(d.dataset.detail);
});

$('searchInput').addEventListener('input', render);
$('sortOrder').addEventListener('change', render);
document.querySelectorAll('#panelSearch .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    presenceFilter = chip.dataset.filter;
    document.querySelectorAll('#panelSearch .chip')
      .forEach(c => c.setAttribute('aria-pressed', c === chip));
    render();
  });
});

/* ---------------- abas ---------------- */
const tabs = { tabSearch:'panelSearch', tabRegister:'panelRegister', tabRaffle:'panelRaffle' };
function switchTab(tid){
  Object.entries(tabs).forEach(([t,p]) => {
    const sel = t === tid;
    $(t).setAttribute('aria-selected', sel);
    $(p).classList.toggle('active', sel);
  });
  window.scrollTo({ top:0, behavior:'smooth' });
}
Object.keys(tabs).forEach(tid => $(tid).addEventListener('click', () => switchTab(tid)));

/* =====================================================================
   5. PRESENÇA
   ===================================================================== */
async function togglePresence(id, btn){
  const c = cars.find(x => x.id === id);
  if (!c) return;
  const novo = !c.presente;
  setBusy(btn, true);

  const { error } = await sb.from('carros')
    .update({ presente: novo, checkin_em: novo ? new Date().toISOString() : null })
    .eq('id', id);

  setBusy(btn, false);
  if (error){ toast('Erro ao salvar presença: ' + error.message, 'err'); return; }

  c.presente = novo;
  c.checkin_em = novo ? new Date().toISOString() : null;
  render();
  if (modalCarId === id) fillModal(c);
  toast(novo ? `✓ ${c.modelo} confirmado no evento` : `Check-in desfeito: ${c.modelo}`, novo ? 'ok' : '');
}

/* =====================================================================
   6. MODAL
   ===================================================================== */
const scrim = $('modalScrim');

function openModal(id){
  const c = cars.find(x => x.id === id);
  if (!c) return;
  modalCarId = id;
  fillModal(c);
  scrim.classList.add('open');
}

function fillModal(c){
  $('modalPlate').textContent = c.placa;
  $('modalTitle').textContent = `${c.modelo} · ${c.ano}`;
  const quando = c.checkin_em
    ? new Date(c.checkin_em).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})
    : null;
  const ordCad = ordemCadastroMap.get(c.id);
  const ordPre = ordemPresencaMap.get(c.id);
  $('modalMeta').innerHTML =
    `${ordemBadges(c)}
     <span><b>Ordem de cadastro:</b> ${ordCad ? ordCad + 'º cadastrado' : '—'}</span>
     <span><b>Ordem de presença:</b> ${ordPre ? ordPre + 'º presente' : 'ainda não confirmou'}</span>
     <span><b>Cor:</b> ${escapeHtml(c.cor)}</span>
     <span><b>Dono:</b> ${escapeHtml(c.dono)}</span>
     ${c.proprietario ? `<span><b>Proprietário:</b> ${escapeHtml(c.proprietario)}</span>` : ''}
     ${c.cidade ? `<span><b>Cidade:</b> ${escapeHtml(c.cidade)}</span>` : ''}
     ${c.telefone ? `<span><b>Telefone:</b> <a href="tel:${escapeHtml(c.telefone.replace(/\D/g,''))}" style="color:var(--teal-dark)">${escapeHtml(c.telefone)}</a></span>` : ''}
     <span><b>Status:</b> ${c.presente ? 'Presente no evento' + (quando ? ` (check-in ${quando})` : '') : 'Aguardando chegada'}</span>
     ${c.a_venda ? '<span class="sale-tag">Disponível para venda</span>' : ''}`;
  $('modalGallery').innerHTML = (c.fotos || [])
    .map((p,i) => `<img src="${photoUrl(p)}" alt="Foto ${i+1} de ${escapeHtml(c.modelo)}" loading="lazy">`).join('');
  $('modalDesc').textContent = c.descricao || 'Sem descrição cadastrada.';
  const pBtn = $('modalPresence');
  pBtn.textContent = c.presente ? 'Desfazer check-in' : 'Confirmar presença';
  pBtn.className = 'btn btn-sm ' + (c.presente ? 'btn-checkout' : 'btn-checkin');
}

$('modalPresence').addEventListener('click', e => {
  if (modalCarId) togglePresence(modalCarId, e.currentTarget);
});
$('modalEdit').addEventListener('click', () => { if (modalCarId) startEdit(modalCarId); });

/* =====================================================================
   GERAÇÃO DE FICHAS / CERTIFICADOS
   ===================================================================== */

/* numera cada carro conforme a ordem de cadastro (mais antigo = 1) */
function numeroDoCarro(car){
  return ordemCadastroMap.get(car.id) ?? 1;
}

function updateGenInfo(n){
  const el = $('genInfo');
  const btn = $('genBatchBtn');
  if (!el || !btn) return;
  if (!n){
    el.textContent = 'Nenhum carro nos resultados atuais.';
    btn.disabled = true;
  } else {
    el.textContent = n === 1
      ? 'Gerar a ficha do carro exibido abaixo.'
      : `Gerar as fichas dos ${n} carros exibidos abaixo` +
        (cars.length !== n ? ' (conforme busca/filtro).' : '.');
    btn.disabled = false;
  }
}

const genOverlay = $('genOverlay');
function openGen(msg){
  $('genMsg').textContent = msg || 'Gerando fichas…';
  $('genCount').textContent = '';
  genOverlay.classList.add('open');
}
function closeGen(){ genOverlay.classList.remove('open'); }

async function gerarParaLista(lista){
  if (!lista.length){ toast('Nenhum carro para gerar.', 'err'); return; }
  computeOrders();
  const comNumero = lista.map(c => ({ ...c, __numero: numeroDoCarro(c) }));
  const multiplos = comNumero.length > 1;
  openGen(multiplos ? 'Gerando fichas…' : 'Gerando ficha…');
  try {
    const res = await window.Fichas.gerarFichas(comNumero, (feito, total) => {
      $('genCount').textContent = `${feito} de ${total}`;
    });
    closeGen();
    toast(res.zipped
      ? `✓ ${res.count} fichas geradas — baixando o .zip.`
      : '✓ Ficha gerada — baixando o PDF.', 'ok');
  } catch (err){
    closeGen();
    console.error('Falha ao gerar ficha:', err);
    toast('Erro ao gerar: ' + (err.message || err), 'err');
  }
}

/* botão do modal — ficha individual */
$('modalCert').addEventListener('click', () => {
  const c = cars.find(x => x.id === modalCarId);
  if (c) gerarParaLista([c]);
});

/* botão em lote — respeita busca + filtro de presença ativos */
$('genBatchBtn').addEventListener('click', () => {
  gerarParaLista(filteredCars());
});

/* exclusão com confirmação em dois toques */
const deleteBtn = $('modalDelete');
let deleteArmed = false, deleteTimer = null;
function resetDeleteBtn(){
  deleteArmed = false;
  clearTimeout(deleteTimer);
  deleteBtn.disabled = false;
  deleteBtn.textContent = 'Excluir cadastro';
  deleteBtn.classList.remove('armed');
}
deleteBtn.addEventListener('click', async () => {
  if (!modalCarId) return;
  if (!deleteArmed){
    deleteArmed = true;
    deleteBtn.textContent = 'Toque de novo para excluir';
    deleteBtn.classList.add('armed');
    deleteTimer = setTimeout(resetDeleteBtn, 4000);
    return;
  }
  const id = modalCarId;
  const c = cars.find(x => x.id === id);
  clearTimeout(deleteTimer);
  setBusy(deleteBtn, true, 'Excluindo…');

  const { error } = await sb.from('carros').delete().eq('id', id);
  if (error){
    setBusy(deleteBtn, false); resetDeleteBtn();
    toast('Erro ao excluir: ' + error.message, 'err');
    return;
  }
  await removePhotos(c?.fotos || []);
  cars = cars.filter(x => x.id !== id);
  resetDeleteBtn();
  closeModal();
  render();
  toast('Cadastro excluído.', 'ok');
});

$('modalClose').addEventListener('click', closeModal);
scrim.addEventListener('click', e => { if (e.target === scrim) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
function closeModal(){ scrim.classList.remove('open'); modalCarId = null; resetDeleteBtn(); }

/* =====================================================================
   7. FORMULÁRIO (cadastro + edição)
   ===================================================================== */
const carForm = $('carForm');
const uploadZone = $('uploadZone');
const fileInput = $('fFotos');
const formMsg = $('formMsg');

/* toggle Sim/Não "à venda" */
let aVenda = false;
function setVenda(v){
  aVenda = v;
  $('fVendaSim').setAttribute('aria-pressed', v);
  $('fVendaNao').setAttribute('aria-pressed', !v);
}
$('fVendaSim').addEventListener('click', () => setVenda(true));
$('fVendaNao').addEventListener('click', () => setVenda(false));

/* máscara de telefone */
attachPhoneMask($('fTelefone'));

/* limites do campo de ano */
attachAnoLimits($('fAno'), $('anoHint'));

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
    reader.onload = () => {
      photoItems.push({ kind:'new', file, preview: reader.result });
      renderPreviews();
    };
    reader.readAsDataURL(file);
  });
}

function renderPreviews(){
  $('previews').innerHTML = photoItems.map((p,i) => `
    <div class="preview">
      <img src="${p.kind === 'new' ? p.preview : photoUrl(p.path)}" alt="Foto ${i+1}">
      <button type="button" data-remove="${i}" aria-label="Remover foto ${i+1}">✕</button>
      ${p.kind === 'new' ? '<span class="tag-new">NOVA</span>' : ''}
    </div>`).join('');
}
$('previews').addEventListener('click', e => {
  const btn = e.target.closest('[data-remove]');
  if (!btn) return;
  photoItems.splice(Number(btn.dataset.remove), 1);
  renderPreviews();
});

function setFormMode(){
  const editing = editingId != null;
  $('formTitle').textContent = editing ? 'Editar carro' : 'Novo carro';
  $('formSub').textContent = editing ? 'Alterando cadastro existente' : 'Ficha de inscrição do veículo';
  $('submitBtn').textContent = editing ? 'Salvar alterações' : 'Cadastrar carro';
  $('clearFormBtn').textContent = editing ? 'Cancelar edição' : 'Limpar';
}

function startEdit(id){
  const c = cars.find(x => x.id === id);
  if (!c) return;
  editingId = id;
  $('fPlaca').value = c.placa;
  $('fAno').value = c.ano;
  $('fModelo').value = c.modelo;
  $('fCor').value = c.cor;
  $('fDono').value = c.dono;
  $('fProprietario').value = c.proprietario || '';
  $('fCidade').value = c.cidade || '';
  $('fTelefone').value = c.telefone || '';
  setVenda(!!c.a_venda);
  $('fDesc').value = c.descricao || '';
  photoItems = (c.fotos || []).map(path => ({ kind:'existing', path }));
  renderPreviews();
  formMsg.className = 'form-msg';
  setFormMode();
  closeModal();
  switchTab('tabRegister');
}

function resetForm(){
  carForm.reset();
  photoItems = [];
  renderPreviews();
  editingId = null;
  setVenda(false);
  setFormMode();
  formMsg.className = 'form-msg';
}

function showMsg(type, text){
  formMsg.textContent = text;
  formMsg.className = 'form-msg ' + type;
  if (type === 'ok') setTimeout(() => { formMsg.className = 'form-msg'; }, 6000);
}

$('clearFormBtn').addEventListener('click', () => {
  const wasEditing = editingId != null;
  resetForm();
  if (wasEditing) switchTab('tabSearch');
});

carForm.addEventListener('submit', async e => {
  e.preventDefault();
  const placa = $('fPlaca').value.trim().toUpperCase();
  const ano = parseInt($('fAno').value, 10);
  const modelo = $('fModelo').value.trim();
  const cor = $('fCor').value.trim();
  const dono = $('fDono').value.trim();
  const proprietario = $('fProprietario').value.trim();
  const cidade = $('fCidade').value.trim();
  const telefone = $('fTelefone').value.trim();
  const descricao = $('fDesc').value.trim();

  if (!placa || !modelo || !cor || !dono || !ano || !proprietario || !cidade || !telefone){
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
  if (cars.some(c => c.placa === placa && c.id !== editingId)){
    showMsg('err','✕ Já existe um carro cadastrado com a placa ' + placa + '.'); return;
  }

  const btn = $('submitBtn');
  setBusy(btn, true, 'Salvando…');

  try {
    const carId = editingId || crypto.randomUUID();
    const novos = photoItems.filter(p => p.kind === 'new').map(p => p.file);
    const novosPaths = await uploadPhotos(carId, novos);

    // remonta a lista final preservando a ordem escolhida
    let idx = 0;
    const fotos = photoItems.map(p => p.kind === 'existing' ? p.path : novosPaths[idx++]);

    if (editingId){
      const original = cars.find(c => c.id === editingId);
      const removidas = (original?.fotos || []).filter(p => !fotos.includes(p));

      const { error } = await sb.from('carros')
        .update({ placa, ano, modelo, cor, dono, proprietario, cidade, telefone, a_venda: aVenda, descricao, fotos })
        .eq('id', editingId);
      if (error) throw error;

      await removePhotos(removidas);
      toast('✓ Cadastro atualizado.', 'ok');
      resetForm();
      await loadCarsQuiet();
      switchTab('tabSearch');
    } else {
      const { error } = await sb.from('carros').insert({
        id: carId, placa, ano, modelo, cor, dono, proprietario, cidade, telefone,
        a_venda: aVenda, descricao, fotos, presente: false, origem: 'organizador'
      });
      if (error) throw error;

      resetForm();
      showMsg('ok', `✓ ${modelo} cadastrado! Placa ${placa} já aparece na pesquisa.`);
      toast('✓ Carro cadastrado com sucesso.', 'ok');
      await loadCarsQuiet();
    }
  } catch (err){
    const dup = /duplicate key|unique/i.test(err.message || '');
    showMsg('err', '✕ ' + (dup ? `A placa ${placa} já está cadastrada.` : (err.message || 'Erro ao salvar.')));
  } finally {
    setBusy(btn, false);
    setFormMode();
  }
});

/* =====================================================================
   8. SORTEADOR DE PRÊMIOS
   Os ganhadores ficam salvos neste navegador (localStorage), então o
   sorteio sobrevive a um F5 sem precisar mexer no banco.
   ===================================================================== */
const LS_RAFFLE = 'carros_sorteio';

let rafflePool = 'present';     // 'present' = só quem confirmou presença
let raffleWinners = [];         // ids na ordem em que foram sorteados
let raffleSpinning = false;

(function loadWinners(){
  try {
    const saved = JSON.parse(localStorage.getItem(LS_RAFFLE) || '[]');
    if (Array.isArray(saved)) raffleWinners = saved.filter(id => typeof id === 'string');
  } catch (_) {}
})();

function saveWinners(){
  try { localStorage.setItem(LS_RAFFLE, JSON.stringify(raffleWinners)); } catch (_) {}
}

/* carros que ainda podem ser sorteados */
function raffleCandidates(){
  return cars.filter(c =>
    !raffleWinners.includes(c.id) &&
    (rafflePool === 'all' || c.presente));
}

/* sorteio uniforme usando o gerador criptográfico do navegador */
function pickRandom(list){
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return list[buf[0] % list.length];
}

function raffleCarLine(c){
  const cad = ordemCadastroMap.get(c.id);
  const pre = ordemPresencaMap.get(c.id);
  return `<span class="rf-plate">${escapeHtml(c.placa)}</span>
    <span class="rf-model">${escapeHtml(c.modelo)} · ${c.ano}</span>
    <span class="rf-owner">${escapeHtml(c.proprietario || c.dono)}${c.cidade ? ' — ' + escapeHtml(c.cidade) : ''}</span>
    <span class="rf-ords">${cad ? `${cad}º cadastrado` : ''}${cad && pre ? ' · ' : ''}${pre ? `${pre}º presente` : ''}</span>`;
}

function showRaffleWinner(c){
  $('raffleDisplay').innerHTML =
    `<div class="rf-winner">
       <span class="rf-tag">Sorteado!</span>
       ${raffleCarLine(c)}
     </div>`;
}

function renderRaffle(){
  const disponiveis = raffleCandidates();
  const poolEl = $('rafflePool');
  const btn = $('raffleBtn');
  if (!poolEl || !btn) return;

  poolEl.textContent = disponiveis.length
    ? `${disponiveis.length} ${disponiveis.length === 1 ? 'carro concorrendo' : 'carros concorrendo'}` +
      (rafflePool === 'present' ? ' (presentes)' : ' (todos os cadastrados)')
    : (rafflePool === 'present'
        ? 'Nenhum carro presente disponível para sortear.'
        : 'Todos os carros já foram sorteados.');
  btn.disabled = !disponiveis.length || raffleSpinning;

  const ganhadores = raffleWinners
    .map(id => cars.find(c => c.id === id))
    .filter(Boolean);

  $('raffleEmpty').style.display = ganhadores.length ? 'none' : 'block';
  $('raffleList').innerHTML = ganhadores.map((c,i) => `
    <div class="rf-row">
      <span class="rf-pos">${i+1}º</span>
      <div class="rf-info">${raffleCarLine(c)}</div>
      <button type="button" class="rf-remove" data-raffle-remove="${c.id}"
              aria-label="Remover ${escapeHtml(c.placa)} da lista de sorteados">✕</button>
    </div>`).join('');
}

async function drawWinner(){
  if (raffleSpinning) return;
  const disponiveis = raffleCandidates();
  if (!disponiveis.length){ toast('Nenhum carro disponível para sortear.', 'err'); return; }

  raffleSpinning = true;
  $('raffleBtn').disabled = true;
  const display = $('raffleDisplay');
  display.classList.add('spinning');

  // suspense: passa rapidamente por candidatos aleatórios
  const passos = Math.min(14, Math.max(6, disponiveis.length));
  for (let i = 0; i < passos; i++){
    const previa = pickRandom(disponiveis);
    display.innerHTML = `<div class="rf-winner rf-preview">${raffleCarLine(previa)}</div>`;
    await new Promise(r => setTimeout(r, 70 + i * 14));
  }

  const vencedor = pickRandom(disponiveis);
  display.classList.remove('spinning');
  showRaffleWinner(vencedor);

  raffleWinners.push(vencedor.id);
  saveWinners();
  raffleSpinning = false;
  renderRaffle();
  toast(`🎉 ${vencedor.placa} — ${vencedor.modelo} foi sorteado!`, 'ok');
}

$('raffleBtn').addEventListener('click', drawWinner);

$('raffleList').addEventListener('click', e => {
  const btn = e.target.closest('[data-raffle-remove]');
  if (!btn) return;
  const id = btn.dataset.raffleRemove;
  const c = cars.find(x => x.id === id);
  raffleWinners = raffleWinners.filter(w => w !== id);
  saveWinners();
  renderRaffle();
  toast(c ? `${c.placa} voltou para o sorteio.` : 'Removido da lista.');
});

document.querySelectorAll('#panelRaffle [data-pool]').forEach(chip => {
  chip.addEventListener('click', () => {
    rafflePool = chip.dataset.pool;
    document.querySelectorAll('#panelRaffle [data-pool]')
      .forEach(c => c.setAttribute('aria-pressed', c === chip));
    renderRaffle();
  });
});

/* limpar tudo com confirmação em dois toques */
const raffleClearBtn = $('raffleClearBtn');
let clearArmed = false, clearTimer = null;
function resetClearBtn(){
  clearArmed = false;
  clearTimeout(clearTimer);
  raffleClearBtn.textContent = 'Limpar tudo';
  raffleClearBtn.classList.remove('armed');
}
raffleClearBtn.addEventListener('click', () => {
  if (!raffleWinners.length){ toast('A lista já está vazia.'); return; }
  if (!clearArmed){
    clearArmed = true;
    raffleClearBtn.textContent = 'Toque de novo para limpar';
    raffleClearBtn.classList.add('armed');
    clearTimer = setTimeout(resetClearBtn, 4000);
    return;
  }
  raffleWinners = [];
  saveWinners();
  resetClearBtn();
  $('raffleDisplay').innerHTML = '<span class="raffle-idle">Toque em <b>Sortear</b> para começar</span>';
  renderRaffle();
  toast('Lista de sorteados limpa.', 'ok');
});

/* ---------------- start ---------------- */
setFormMode();
setVenda(false);
renderRaffle();
boot();
