/* =====================================================================
   GERADOR DE FICHAS / CERTIFICADOS
   Usa a arte oficial (ficha-modelo.jpg) como fundo e escreve os dados
   cadastrados exatamente sobre os campos em branco da imagem.
   Gera PDF (um por carro) e, com vários carros, empacota num .zip.
   Depende de: jsPDF e JSZip (via CDN no HTML).
   ===================================================================== */

const FICHA_IMG = 'ficha-modelo.jpg';   // arte oficial (1280 x 853)
const FICHA_W = 1280, FICHA_H = 853;

/* Coordenadas medidas sobre a imagem 1280x853.
   x = onde começa o texto dentro da caixa; y = linha de base do texto. */
const CAMPOS = {
  modelo:       { x: 405, y: 312 },
  ano:          { x: 405, y: 381 },
  placa:        { x: 405, y: 449 },
  proprietario: { x: 405, y: 517 },
  cidade:       { x: 405, y: 585 },
  telefone:     { x: 405, y: 652 }
};
/* Quadrados dos checkboxes (centro), medidos na imagem */
const CHECK_SIM = { x: 500, y: 727 };
const CHECK_NAO = { x: 728, y: 727 };
/* Linha do "Nº DO VEÍCULO:" no rodapé */
const NUM_POS = { x: 700, y: 782 };

/* carrega a arte uma vez e reaproveita */
let _fichaImg = null;
function carregarFicha(){
  if (_fichaImg) return Promise.resolve(_fichaImg);
  return new Promise((resolve, reject) => {
    const img = new Image();
    // evita "canvas tainted" ao exportar o PDF
    img.crossOrigin = 'anonymous';
    img.onload = () => { _fichaImg = img; resolve(img); };
    img.onerror = () => {
      // tenta de novo sem crossOrigin (mesma origem não precisa)
      const img2 = new Image();
      img2.onload = () => { _fichaImg = img2; resolve(img2); };
      img2.onerror = () => reject(new Error('Não foi possível carregar a arte da ficha (ficha-modelo.jpg). Verifique se o arquivo está na mesma pasta do site.'));
      img2.src = FICHA_IMG;
    };
    img.src = FICHA_IMG;
  });
}

/* desenha um texto ajustando o tamanho da fonte para caber na largura */
function textoAjustado(ctx, texto, x, y, maxW, base=34){
  texto = (texto ?? '').toString();
  let size = base;
  ctx.textBaseline = 'alphabetic';
  do {
    ctx.font = `600 ${size}px Georgia, 'Times New Roman', serif`;
    if (ctx.measureText(texto).width <= maxW || size <= 18) break;
    size -= 1;
  } while (true);
  ctx.fillStyle = '#1f3b3b';
  ctx.fillText(texto, x, y);
}

/* monta o canvas da ficha preenchida para um carro */
async function renderFichaCanvas(car, numero){
  const img = await carregarFicha();
  const canvas = document.createElement('canvas');
  canvas.width = FICHA_W; canvas.height = FICHA_H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, FICHA_W, FICHA_H);

  const val = {
    modelo: car.modelo || '',
    ano: car.ano != null ? String(car.ano) : '',
    placa: (car.placa || '').toUpperCase(),
    proprietario: car.proprietario || car.dono || '',
    cidade: car.cidade || '',
    telefone: car.telefone || ''
  };
  const maxW = 1090 - CAMPOS.modelo.x; // caixa vai até ~x1120
  for (const k of Object.keys(CAMPOS)){
    textoAjustado(ctx, val[k], CAMPOS[k].x, CAMPOS[k].y, maxW);
  }

  // marca o checkbox correspondente com um "X"
  const alvo = car.a_venda ? CHECK_SIM : CHECK_NAO;
  ctx.strokeStyle = '#AE4226';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  const s = 9;
  ctx.beginPath();
  ctx.moveTo(alvo.x - s, alvo.y - s); ctx.lineTo(alvo.x + s, alvo.y + s);
  ctx.moveTo(alvo.x + s, alvo.y - s); ctx.lineTo(alvo.x - s, alvo.y + s);
  ctx.stroke();

  // número do veículo
  if (numero != null){
    ctx.font = "700 26px Georgia, serif";
    ctx.fillStyle = '#D96A33';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    ctx.fillText(String(numero).padStart(3,'0'), NUM_POS.x, NUM_POS.y);
    ctx.textAlign = 'left';
  }

  return canvas;
}

/* converte o canvas em PDF (A4 paisagem, ajustado à página) */
async function fichaParaPdfBlob(car, numero){
  const canvas = await renderFichaCanvas(car, numero);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  const ratio = FICHA_W / FICHA_H;
  const pageRatio = pageW / pageH;
  let w, h, x, y;
  if (ratio > pageRatio){ w = pageW; h = pageW / ratio; x = 0; y = (pageH - h)/2; }
  else { h = pageH; w = pageH * ratio; x = (pageW - w)/2; y = 0; }

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  pdf.addImage(dataUrl, 'JPEG', x, y, w, h);
  return pdf.output('blob');
}

function certFileName(car, numero){
  const base = (car.placa || car.modelo || 'ficha')
    .toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').toUpperCase();
  const n = numero != null ? String(numero).padStart(3,'0') + '-' : '';
  return `ficha-${n}${base || 'carro'}.pdf`;
}

function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* API principal:
   - 1 carro  -> baixa 1 PDF
   - N carros -> baixa 1 .zip com todos os PDFs */
async function gerarFichas(lista, onProgress){
  if (!lista || !lista.length) throw new Error('Nenhum carro para gerar.');

  if (lista.length === 1){
    const car = lista[0];
    const blob = await fichaParaPdfBlob(car, car.__numero ?? 1);
    downloadBlob(blob, certFileName(car, car.__numero ?? 1));
    onProgress && onProgress(1, 1);
    return { count: 1, zipped: false };
  }

  const zip = new JSZip();
  let done = 0;
  for (const car of lista){
    const blob = await fichaParaPdfBlob(car, car.__numero);
    zip.file(certFileName(car, car.__numero), blob);
    done++;
    onProgress && onProgress(done, lista.length);
    await new Promise(r => setTimeout(r, 0));
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const hoje = new Date().toISOString().slice(0,10);
  downloadBlob(zipBlob, `fichas-carros-antigos-${hoje}.zip`);
  return { count: lista.length, zipped: true };
}

window.Fichas = { gerarFichas, renderFichaCanvas };
