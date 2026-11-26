// Acceso de clientes y comercios.
// El ID se valida en el backend (Supabase): la lista de IDs y links de carpetas ya no es pública.
const URL_ACCESO = "https://natxchgrtqvhsjfbsymp.supabase.co/functions/v1/acceso";

async function validarAcceso(tipo, idCampo, textoVacio) {
  const id = document.getElementById(idCampo).value.trim();
  const mensaje = document.getElementById("mensaje");

  if (!id) {
    mensaje.innerHTML = `<p class='error'>${textoVacio}</p>`;
    return;
  }

  mensaje.innerHTML = "<p class='cargando'>Verificando tu clave...</p>";

  try {
    const res = await fetch(URL_ACCESO, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, id })
    });
    const data = await res.json();

    if (res.status === 429) {
      mensaje.innerHTML = "<p class='error'>⚠️ Demasiados intentos. Esperá unos minutos e intentá de nuevo.</p>";
    } else if (data.ok && /^https:\/\//.test(data.enlace)) {
      mensaje.innerHTML = "<p class='exito'>✅ ¡Clave correcta! Abriendo tu carpeta...</p>";
      setTimeout(() => window.open(data.enlace, "_blank", "noopener"), 1500);
    } else if (res.ok) {
      mensaje.innerHTML = "<p class='error'>❌ ID inválido. Verifícalo o escribinos por WhatsApp</p>";
    } else {
      mensaje.innerHTML = "<p class='error'>⚠️ Error de conexión. Intentá nuevamente en unos minutos</p>";
    }
  } catch (error) {
    mensaje.innerHTML = "<p class='error'>⚠️ Error de conexión. Intentá nuevamente en unos minutos</p>";
  }
}

function validarCliente() {
  return validarAcceso("cliente", "idCliente", "Escribí tu ID de cliente");
}

function validarComercio() {
  return validarAcceso("comercio", "idComercio", "Escribí tu ID de comercio");
}
