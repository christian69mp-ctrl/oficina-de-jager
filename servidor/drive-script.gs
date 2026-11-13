// La oficina de Jager · Entrega a Pixelido en Google Drive
// Pega todo esto en script.google.com (ver servidor/README.md).
// Cambia CLAVE por una contraseña inventada: la misma que guardes como DRIVE_CLAVE en el servidor.
const CLAVE = 'CAMBIA_ESTA_CLAVE';

function doPost(e) {
  try {
    const d = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (d.clave !== CLAVE) return salida({ error: 'Clave de Drive incorrecta' });
    if (d.accion === 'carpetas') return salida({ carpetas: carpetas(d.buscar || 'Pixelido') });
    if (d.accion === 'guardar') return salida(guardar(d));
    if (d.accion === 'imagen') return salida(imagen(d));
    if (d.accion === 'carpeta') return salida(carpeta(d));
    if (d.accion === 'documento') return salida(documento(d));
    return salida({ error: 'Acción desconocida' });
  } catch (err) {
    return salida({ error: String((err && err.message) || err) });
  }
}

// Abrir la dirección del script en el navegador debe mostrar {"ok":true}
function doGet() { return salida({ ok: true }); }

// Carpetas de tu Drive cuyo nombre contiene el texto buscado
function carpetas(texto) {
  const res = [];
  const it = DriveApp.searchFolders("title contains '" + String(texto).replace(/'/g, "\\'") + "' and trashed = false");
  while (it.hasNext() && res.length < 15) {
    const f = it.next();
    res.push({ id: f.getId(), title: f.getName(), url: f.getUrl() });
  }
  return res;
}

const limpio = (t, n) => String(t || '').replace(/[\\/:*?"<>|]/g, '-').trim().slice(0, n || 180);

// Busca una carpeta por nombre dentro de otra; si no existe, la crea
function hija(padre, nombre) {
  const it = padre.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : padre.createFolder(nombre);
}

// Deja la carpeta solo para ti: sin enlace público y sin nadie más con acceso
function hacerPrivada(f) {
  f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  f.getEditors().forEach(u => f.removeEditor(u));
  f.getViewers().forEach(u => f.removeViewer(u));
}

// Crea (o reutiliza) una carpeta en la raíz de tu Drive
function carpeta(d) {
  const f = hija(DriveApp.getRootFolder(), limpio(d.nombre || 'Oficina Jager', 100));
  if (d.privada) hacerPrivada(f);
  return { ok: true, id: f.getId(), title: f.getName(), url: f.getUrl(), privada: !!d.privada };
}

// Carpeta de destino: la elegida y, si se pide, una subcarpeta (un pedido o un vídeo)
function destino(d) {
  let c = d.carpeta ? DriveApp.getFolderById(d.carpeta) : DriveApp.getRootFolder();
  if (d.subcarpeta) c = hija(c, limpio(d.subcarpeta, 120));
  return c;
}

// Guarda un texto (guion, paquete, pedido, proyecto o un archivo de código con su extensión)
function guardar(d) {
  const c = destino(d);
  const ext = /^\.[\w]{1,8}$/.test(d.ext || '') ? d.ext : '.txt';
  const f = c.createFile(limpio(d.titulo || 'Paquete Pixelido') + ext, String(d.texto || ''), MimeType.PLAIN_TEXT);
  return { ok: true, id: f.getId(), url: f.getUrl(), carpetaUrl: c.getUrl() };
}

// Guarda una imagen (miniatura) que llega en base64
function imagen(d) {
  const c = destino(d);
  const mime = d.mime || 'image/png';
  const ext = mime === 'image/jpeg' ? '.jpg' : mime === 'image/webp' ? '.webp' : '.png';
  const blob = Utilities.newBlob(Utilities.base64Decode(String(d.base64 || '')), mime, limpio(d.titulo || 'Miniatura') + ext);
  const f = c.createFile(blob);
  return { ok: true, id: f.getId(), url: f.getUrl(), carpetaUrl: c.getUrl() };
}

// Paquete del vídeo como Google Doc con formato: ficha, guion de edición en dos columnas y locución aparte
function documento(d) {
  const A = DocumentApp.Attribute;
  const estilo = (el, o) => {
    const a = {};
    if (o.color) a[A.FOREGROUND_COLOR] = o.color;
    if (o.bg) a[A.BACKGROUND_COLOR] = o.bg;
    if (o.size) a[A.FONT_SIZE] = o.size;
    if (o.font) a[A.FONT_FAMILY] = o.font;
    a[A.BOLD] = !!o.bold; a[A.ITALIC] = !!o.italic;
    el.setAttributes(a); return el;
  };
  const T = x => { const v = String(x == null ? '' : x); return v.trim() ? v : ' '; };
  const c = destino(d);
  const doc = DocumentApp.create(limpio(d.titulo || 'Paquete Pixelido', 150));
  const body = doc.getBody();
  body.setMarginLeft(42).setMarginRight(42).setMarginTop(42).setMarginBottom(42);
  const p = (texto, o) => { const x = body.appendParagraph(T(texto)); x.setSpacingAfter(o && o.after != null ? o.after : 4); return estilo(x, Object.assign({ font: 'Arial', size: 11, color: '#1f2937' }, o || {})); };
  const titulo = (texto, color) => { const x = body.appendParagraph(T(texto)); x.setHeading(DocumentApp.ParagraphHeading.HEADING1); x.setSpacingBefore(10).setSpacingAfter(8); return estilo(x, { font: 'Arial', size: 17, bold: true, color: color || '#111827' }); };
  // portada
  const cab = body.getParagraphs()[0]; cab.setText(T(d.cabecera || d.titulo)); estilo(cab, { font: 'Arial', size: 20, bold: true, color: '#111827' });
  p(d.subtitulo || '', { size: 10, color: '#6b7280', after: 10 });
  p('Cómo leer este documento:  LOCUCIÓN = lo que se dice  ·  IMAGEN = lo que se ve  ·  TEXTO EN PANTALLA = rótulos  ·  SONIDO = música y efectos', { size: 9, color: '#374151', bg: '#f3f4f6', after: 12 });
  // 1. ficha
  titulo('1 · Los 3 títulos', '#7c3aed');
  (d.titulos || []).forEach((t, i) => p(`${i + 1}.  ${t}${i === 0 ? '   ← recomendado' : ''}`, { size: 12, bold: i === 0, color: i === 0 ? '#111827' : '#374151' }));
  if (d.miniaturas) { titulo('2 · Las 3 miniaturas', '#7c3aed'); String(d.miniaturas).split('\n').forEach(l => p(l, { size: 11 })); }
  if (d.encargo) { titulo('3 · Encargo para Pixelido', '#7c3aed'); String(d.encargo).split('\n').forEach(l => p(l, { size: 11 })); }
  // 2. guion de edición en dos columnas
  body.appendPageBreak();
  titulo('4 · Guion de edición', '#b45309');
  p('Columna izquierda: lo que se dice. Columna derecha: lo que se ve, los rótulos y el sonido de ese mismo momento.', { size: 10, color: '#6b7280', after: 8 });
  const t = body.appendTable([['BLOQUE', 'LOCUCIÓN · lo que se dice', 'EDICIÓN · lo que se ve y se oye']]);
  t.setBorderColor('#d1d5db');
  t.setColumnWidth(0, 62); t.setColumnWidth(1, 250); t.setColumnWidth(2, 200);
  const h = t.getRow(0); for (let i = 0; i < 3; i++) { const cel = h.getCell(i); cel.setBackgroundColor('#111827'); estilo(cel.getChild(0).asParagraph(), { font: 'Arial', size: 9, bold: true, color: '#ffffff' }); }
  (d.bloques || []).forEach((b, k) => {
    const fila = t.appendTableRow();
    const c0 = fila.appendTableCell(' '), c1 = fila.appendTableCell(' '), c2 = fila.appendTableCell(' ');
    c0.setBackgroundColor('#fef3c7'); c1.setBackgroundColor(k % 2 ? '#ffffff' : '#fafafa'); c2.setBackgroundColor('#f8fafc');
    const p0 = c0.getChild(0).asParagraph(); p0.setText(T(b.cab)); estilo(p0, { font: 'Arial', size: 9, bold: true, color: '#92400e' });
    const lineas = String(b.locucion || '').split(/\n+/).filter(x => x.trim());
    const p1 = c1.getChild(0).asParagraph(); p1.setText(T(lineas[0])); estilo(p1, { font: 'Georgia', size: 11, color: '#111827' }); p1.setLineSpacing(1.25);
    lineas.slice(1).forEach(l => { const x = c1.appendParagraph(T(l)); estilo(x, { font: 'Georgia', size: 11, color: '#111827' }); x.setLineSpacing(1.25); });
    const p2 = c2.getChild(0).asParagraph(); p2.setText(' ');
    const bloque = (etq, texto, cEtq, o) => { if (!texto || !String(texto).trim()) return; const e = c2.appendParagraph(etq); estilo(e, { font: 'Arial', size: 8, bold: true, color: cEtq }); e.setSpacingBefore(4); const x = c2.appendParagraph(T(texto)); estilo(x, Object.assign({ font: 'Arial', size: 9 }, o)); };
    bloque('IMAGEN', b.imagen, '#1d4ed8', { color: '#1e3a8a' });
    bloque('TEXTO EN PANTALLA', b.texto, '#c2410c', { color: '#9a3412', bold: true });
    bloque('SONIDO', b.sonido, '#6b7280', { color: '#4b5563', italic: true });
    if (c2.getNumChildren() > 1) c2.removeChild(c2.getChild(0));
  });
  // 3. locución limpia, aparte y grande
  body.appendPageBreak();
  titulo('5 · Locución limpia', '#047857');
  p(d.locucionInfo || 'Para grabar la voz: solo el texto que se lee.', { size: 10, color: '#6b7280', after: 10 });
  (d.locucion || []).forEach(b => { if (b.cab) p(b.cab, { size: 8, color: '#9ca3af', bold: true, after: 2 }); String(b.texto || '').split(/\n+/).filter(x => x.trim()).forEach(l => { const x = p(l, { font: 'Georgia', size: 13, color: '#111827', after: 8 }); x.setLineSpacing(1.5); }); });
  // 4. el resto, al final y en pequeño
  (d.anexos || []).forEach(a => { if (!a.texto) return; body.appendPageBreak(); titulo(a.titulo, '#374151'); String(a.texto).split('\n').forEach(l => p(l, { size: 10, color: '#374151', after: 2 })); });
  doc.saveAndClose();
  const f = DriveApp.getFileById(doc.getId()); f.moveTo(c);
  return { ok: true, id: f.getId(), url: doc.getUrl(), carpetaUrl: c.getUrl() };
}

function salida(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
