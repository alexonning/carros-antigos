/* =====================================================================
   Helpers compartilhados (usados pela página pública e pela interna)
   ===================================================================== */

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
