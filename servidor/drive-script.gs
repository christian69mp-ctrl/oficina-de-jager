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

// Guarda un paquete como archivo de texto en la carpeta elegida
function guardar(d) {
  const carpeta = d.carpeta ? DriveApp.getFolderById(d.carpeta) : DriveApp.getRootFolder();
  const nombre = String(d.titulo || 'Paquete Pixelido').replace(/[\\/:*?"<>|]/g, '-').slice(0, 180) + '.txt';
  const f = carpeta.createFile(nombre, String(d.texto || ''), MimeType.PLAIN_TEXT);
  return { ok: true, id: f.getId(), url: f.getUrl() };
}

function salida(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
