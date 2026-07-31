/* =====================================================================
   GERADOR DE FICHAS / CERTIFICADOS
   Reproduz o layout da ficha impressa "5º Encontro de Carros Antigos"
   preenchido com os dados cadastrados. Gera PDF (um por carro) e,
   quando houver mais de um, empacota tudo num .zip.
   Depende de: jsPDF, svg2pdf.js e JSZip (carregados via CDN no HTML).
   ===================================================================== */

/* Ícones (paths(24x24) desenhados dentro dos círculos teal) */
const CERT_ICONS = {
  modelo: '<path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11m-14 0h14m-14 0v5m14-5v5m-14 2v-2m14 2v-2M7 14h.01M17 14h.01" fill="none" stroke="#F7EED6" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  ano: '<rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="#F7EED6" stroke-width="1.6"/><path d="M4 9h16M8 3v4M16 3v4" stroke="#F7EED6" stroke-width="1.6" stroke-linecap="round"/>',
  placa: '<rect x="3" y="7" width="18" height="10" rx="1.5" fill="none" stroke="#F7EED6" stroke-width="1.4"/><path d="M6 11h12M6 14h8" stroke="#F7EED6" stroke-width="1.4" stroke-linecap="round"/>',
  proprietario: '<circle cx="12" cy="8" r="3.2" fill="none" stroke="#F7EED6" stroke-width="1.6"/><path d="M5.5 19a6.5 6.5 0 0 1 13 0" fill="none" stroke="#F7EED6" stroke-width="1.6" stroke-linecap="round"/>',
  cidade: '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z" fill="none" stroke="#F7EED6" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.4" fill="none" stroke="#F7EED6" stroke-width="1.6"/>',
  telefone: '<path d="M6 3h3l1.5 5-2 1.5a12 12 0 0 0 6 6l1.5-2 5 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z" fill="none" stroke="#F7EED6" stroke-width="1.6" stroke-linejoin="round"/>'
};

/* carro antigo desenhado (silhueta), espelhável */
function carroSVG(flip){
  const t = flip ? 'transform="scale(-1,1) translate(-150,0)"' : '';
  return `<g ${t}>
    <path d="M12 55c0-3 2-5 6-6l10-14c3-4 7-6 13-6h26c7 0 12 3 16 8l9 12c6 1 10 2 14 4 5 2 7 5 7 9v6c0 2-1 3-3 3H15c-2 0-3-1-3-3z"
      fill="#1f4e4e" stroke="#123535" stroke-width="1.5"/>
    <path d="M40 33h20l7 10H33z" fill="#cfe6e0" opacity=".5"/>
    <circle cx="33" cy="63" r="9" fill="#123535"/><circle cx="33" cy="63" r="4" fill="#cfe6e0"/>
    <circle cx="88" cy="63" r="9" fill="#123535"/><circle cx="88" cy="63" r="4" fill="#cfe6e0"/>
    <path d="M112 47l8 2v6h-8z" fill="#1f4e4e"/>
  </g>`;
}

/* escapa texto para XML/SVG */
function xesc(s){
  return (s ?? '').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* Monta o SVG completo da ficha para um carro (numero = Nº do veículo) */
function buildCertSVG(car, numero){
  const linha = (y, icon, label, value) => `
    <g transform="translate(150 ${y})">
      <circle cx="20" cy="20" r="20" fill="#20696b"/>
      <g transform="translate(8 8)">${CERT_ICONS[icon]}</g>
      <text x="52" y="27" font-family="Georgia, 'Times New Roman', serif" font-size="21" font-weight="700" letter-spacing="1" fill="#1f4e4e">${label}</text>
      <rect x="205" y="-2" width="775" height="44" rx="9" fill="#fdfaf0" stroke="#20696b" stroke-width="2"/>
      <text x="223" y="27" font-family="Georgia, 'Times New Roman', serif" font-size="23" fill="#2B2118">${xesc(value)}</text>
    </g>`;

  const check = (x, on) => `
    <rect x="${x}" y="726" width="26" height="26" rx="4" fill="#fdfaf0" stroke="#1f4e4e" stroke-width="2.5"/>
    ${on ? `<path d="M${x+5} 739l6 6 11-13" fill="none" stroke="#AE4226" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` : ''}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 853" width="1280" height="853">
  <defs>
    <clipPath id="frameClip"><rect x="14" y="14" width="1252" height="825" rx="24"/></clipPath>
  </defs>

  <!-- fundo creme -->
  <rect width="1280" height="853" fill="#f7eed6"/>

  <!-- raios de sol nos cantos -->
  <g clip-path="url(#frameClip)" opacity=".55">
    <g fill="#2f8c8c" opacity=".35">
      <path d="M0 0L360 210 0 250z"/><path d="M0 0L250 360 0 250z"/>
      <path d="M0 853L360 643 0 603z"/><path d="M0 853L250 493 0 603z"/>
      <path d="M1280 0L920 210 1280 250z"/><path d="M1280 0L1030 360 1280 250z"/>
      <path d="M1280 853L920 643 1280 603z"/><path d="M1280 853L1030 493 1280 603z"/>
    </g>
    <g fill="#d96a33" opacity=".4">
      <path d="M0 0L340 150 0 180z"/><path d="M0 0L150 340 0 180z"/>
      <path d="M0 853L340 703 0 673z"/><path d="M0 853L150 513 0 673z"/>
      <path d="M1280 0L940 150 1280 180z"/><path d="M1280 0L1130 340 1280 180z"/>
      <path d="M1280 853L940 703 1280 673z"/><path d="M1280 853L1130 513 1280 673z"/>
    </g>
  </g>

  <!-- moldura dupla -->
  <rect x="14" y="14" width="1252" height="825" rx="24" fill="none" stroke="#1f4e4e" stroke-width="10"/>
  <rect x="30" y="30" width="1220" height="793" rx="16" fill="none" stroke="#1f4e4e" stroke-width="2.5"/>

  <!-- carros no topo -->
  <g transform="translate(120 70)">${carroSVG(false)}</g>
  <g transform="translate(1010 70)">${carroSVG(true)}</g>

  <!-- título -->
  <text x="640" y="70" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="30" fill="#1f4e4e">5º Encontro de</text>
  <text x="640" y="140" text-anchor="middle" font-family="'Brush Script MT','Segoe Script',cursive" font-size="82" fill="#AE4226" font-style="italic">Carros Antigos</text>
  <g transform="translate(490 158)">
    <rect x="0" y="0" width="300" height="40" rx="4" fill="#1f4e4e"/>
    <text x="150" y="28" text-anchor="middle" font-family="Georgia, serif" font-size="24" font-weight="700" letter-spacing="4" fill="#f7eed6">PLANALTO • PR</text>
  </g>

  <!-- subtítulo seção -->
  <text x="640" y="245" text-anchor="middle" font-family="Georgia, serif" font-size="38" font-weight="700" letter-spacing="3" fill="#1f4e4e">IDENTIFICAÇÃO DO VEÍCULO</text>
  <path d="M300 235h120M860 235h120" stroke="#AE4226" stroke-width="3" stroke-linecap="round"/>

  <!-- campos -->
  ${linha(290, 'modelo',       'MODELO:',      car.modelo)}
  ${linha(360, 'ano',          'ANO:',         car.ano)}
  ${linha(430, 'placa',        'PLACA:',       car.placa)}
  ${linha(500, 'proprietario', 'PROPRIETÁRIO:', car.proprietario || car.dono || '')}
  ${linha(570, 'cidade',       'CIDADE:',      car.cidade || '')}
  ${linha(640, 'telefone',     'TELEFONE:',    car.telefone || '')}

  <!-- disponível para venda -->
  <text x="640" y="712" text-anchor="middle" font-family="Georgia, serif" font-size="26" font-weight="700" letter-spacing="2" fill="#1f4e4e">DISPONÍVEL PARA VENDA?</text>
  ${check(505, !!car.a_venda)}
  <text x="545" y="747" font-family="Georgia, serif" font-size="24" font-weight="700" fill="#2B2118">SIM</text>
  ${check(650, !car.a_venda)}
  <text x="690" y="747" font-family="Georgia, serif" font-size="24" font-weight="700" fill="#2B2118">NÃO</text>

  <!-- nº do veículo -->
  <g transform="translate(410 775)">
    <rect x="0" y="0" width="460" height="40" rx="6" fill="#1f4e4e"/>
    <text x="20" y="28" font-family="Georgia, serif" font-size="22" font-weight="700" letter-spacing="2" fill="#f7eed6">Nº DO VEÍCULO:</text>
    <text x="250" y="28" font-family="Georgia, serif" font-size="24" font-weight="700" fill="#D96A33">${xesc(numero != null ? String(numero).padStart(3,'0') : '')}</text>
  </g>

  <!-- rodapé -->
  <rect x="30" y="823" width="1220" height="0.1" />
  <text x="640" y="838" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="20" font-weight="700" letter-spacing="1" fill="#1f4e4e">★ OBRIGADO POR FAZER PARTE DA HISTÓRIA SOBRE RODAS! ★</text>
</svg>`;
}

/* Converte um SVG (string) em Blob de PDF (A4 paisagem) via jsPDF + svg2pdf */
async function svgToPdfBlob(svgString){
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  // o SVG precisa estar anexado ao DOM para o svg2pdf medir os elementos
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:1280px;height:853px;';
  holder.innerHTML = svgString;
  const svgEl = holder.querySelector('svg');
  document.body.appendChild(holder);

  // encaixa 1280x853 dentro da página A4 paisagem mantendo proporção
  const svgRatio = 1280 / 853;
  const pageRatio = pageW / pageH;
  let w, h, x, y;
  if (svgRatio > pageRatio){ w = pageW; h = pageW / svgRatio; x = 0; y = (pageH - h)/2; }
  else { h = pageH; w = pageH * svgRatio; x = (pageW - w)/2; y = 0; }

  try {
    const opts = { x, y, width: w, height: h };
    if (typeof pdf.svg === 'function'){
      await pdf.svg(svgEl, opts);                       // jsPDF + svg2pdf plugin
    } else if (typeof window.svg2pdf === 'function'){
      await window.svg2pdf(svgEl, pdf, opts);           // API standalone
    } else {
      throw new Error('svg2pdf não carregou.');
    }
  } finally {
    holder.remove();
  }
  return pdf.output('blob');
}

/* nome de arquivo seguro a partir da placa/modelo */
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

/* API principal: gera fichas para uma lista de carros.
   - 1 carro  -> baixa 1 PDF
   - N carros -> baixa 1 .zip com todos os PDFs
   onProgress(feito, total) é opcional. */
async function gerarFichas(lista, onProgress){
  if (!lista || !lista.length) throw new Error('Nenhum carro para gerar.');

  if (lista.length === 1){
    const car = lista[0];
    const blob = await svgToPdfBlob(buildCertSVG(car, car.__numero ?? 1));
    downloadBlob(blob, certFileName(car, car.__numero ?? 1));
    onProgress && onProgress(1, 1);
    return { count: 1, zipped: false };
  }

  const zip = new JSZip();
  let done = 0;
  for (const car of lista){
    const numero = car.__numero;
    const blob = await svgToPdfBlob(buildCertSVG(car, numero));
    zip.file(certFileName(car, numero), blob);
    done++;
    onProgress && onProgress(done, lista.length);
    // cede o thread para não travar a UI em lotes grandes
    await new Promise(r => setTimeout(r, 0));
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const hoje = new Date().toISOString().slice(0,10);
  downloadBlob(zipBlob, `fichas-carros-antigos-${hoje}.zip`);
  return { count: lista.length, zipped: true };
}

window.Fichas = { gerarFichas, buildCertSVG };
