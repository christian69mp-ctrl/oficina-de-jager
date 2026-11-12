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

function salida(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
