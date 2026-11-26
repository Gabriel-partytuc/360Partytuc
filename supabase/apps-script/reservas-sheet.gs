/**
 * Apps Script que recibe las reservas desde la Edge Function `reservas` de
 * Supabase y las agrega como filas en la hoja "Reservas" de "Gestion Servicios".
 *
 * Instalacion (hacerlo con la cuenta duena de la planilla):
 *  1. Abrir la planilla > Extensiones > Apps Script. Pegar este codigo.
 *  2. Configuracion del proyecto > Propiedades del script > agregar
 *     TOKEN = una clave larga al azar (la misma que SHEETS_WEBHOOK_TOKEN en Supabase).
 *  3. Implementar > Nueva implementacion > Tipo: Aplicacion web
 *     Ejecutar como: Yo | Quien tiene acceso: Cualquier persona.
 *  4. Copiar la URL terminada en /exec (es SHEETS_WEBHOOK_URL en Supabase).
 *
 * Las columnas se mapean por el nombre del encabezado de la fila 1, asi que el
 * orden no importa. Para guardar el nombre del cliente, agregar una columna
 * "Nombre_Cliente" en la hoja; si no existe, ese dato simplemente se omite.
 * Cada vez que se cambia este codigo hay que crear una NUEVA version de la implementacion.
 */
const NOMBRE_HOJA = "Reservas";

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse(e.postData.contents);
    const token = PropertiesService.getScriptProperties().getProperty("TOKEN");
    if (!token || body.token !== token) return salida({ ok: false, error: "no autorizado" });

    const filas = Array.isArray(body.filas) ? body.filas : [];
    if (filas.length === 0 || filas.length > 100) return salida({ ok: false, error: "filas invalidas" });

    lock.waitLock(20000);
    const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOMBRE_HOJA);
    if (!hoja) return salida({ ok: false, error: "no existe la hoja " + NOMBRE_HOJA });

    const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    const valores = filas.map(function (f) {
      return encabezados.map(function (h) {
        const v = f[h];
        // Evita que Sheets interprete como formula un texto que empiece con = + - @
        return typeof v === "string" && /^[=+\-@]/.test(v) ? "'" + v : (v === undefined ? "" : v);
      });
    });
    hoja.getRange(hoja.getLastRow() + 1, 1, valores.length, encabezados.length).setValues(valores);
    return salida({ ok: true, filas: valores.length });
  } catch (err) {
    return salida({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function salida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
