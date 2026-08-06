/* =====================================================================
   Helpers compartilhados (usados pela página pública e pela interna)
   ===================================================================== */

/* Tamanho mínimo do nome do proprietário */
const MIN_PROPRIETARIO = 6;

/* Faixa de anos aceita: de 1800 até o ano atual (nada no futuro) */
const ANO_MIN = 1800;
const anoMax = () => new Date().getFullYear();
const isValidAno = ano => Number.isInteger(ano) && ano >= ANO_MIN && ano <= anoMax();

/* Aplica os limites ao campo de ano e escreve a dica abaixo dele.
   Feito por JS para o limite superior acompanhar a virada do ano. */
function attachAnoLimits(input, hint){
  if (!input) return;
  input.min = ANO_MIN;
  input.max = anoMax();
  if (hint) hint.textContent = `De ${ANO_MIN} até ${anoMax()}`;
}

/* Máscara de telefone: (DD) 9XXXX-XXXX ou (DD) XXXX-XXXX */
function formatPhone(value){
  const d = (value || '').replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2)  return `(${d}`;
  if (d.length <= 6)  return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

/* Liga a máscara a um <input> */
function attachPhoneMask(input){
  if (!input) return;
  input.addEventListener('input', () => {
    const pos = input.selectionStart;
    const before = input.value;
    input.value = formatPhone(input.value);
    // mantém o cursor no fim quando o texto cresce (suficiente para uso mobile)
    if (pos === before.length) input.selectionStart = input.selectionEnd = input.value.length;
  });
}

/* true quando o telefone tem 10 ou 11 dígitos (fixo ou celular) */
function isValidPhone(value){
  const d = (value || '').replace(/\D/g, '');
  return d.length === 10 || d.length === 11;
}

/* Comprime imagem no cliente antes do upload (economiza dados no celular) */
function compressImage(file, maxSide = 1600, quality = 0.82){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler a imagem'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagem inválida'));
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          blob => blob ? resolve(blob) : reject(new Error('Falha ao comprimir')),
          'image/jpeg', quality
        );
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function escapeHtml(s){
  return (s ?? '').toString().replace(/[&<>"']/g, m =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
}
