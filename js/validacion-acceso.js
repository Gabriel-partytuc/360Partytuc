// ENLACES CSV CONFIRMADOS
const URL_CLIENTES = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTdDyaQ_-pJlSUU8rVmndJu4tujt6-JQMUqayWOX5TQDdR5bRc5Wbg4Er3DbrlqT9iM1fsiy8EQCfsW/pub?gid=1192887298&single=true&output=csv";
const URL_COMERCIOS = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTdDyaQ_-pJlSUU8rVmndJu4tujt6-JQMUqayWOX5TQDdR5bRc5Wbg4Er3DbrlqT9iM1fsiy8EQCfsW/pub?gid=579430626&single=true&output=csv";

// Función para convertir CSV a lista de datos
async function cargarCSV(url) {
  const respuesta = await fetch(url);
  const texto = await respuesta.text();
  const filas = texto.split("\n").map(fila => fila.split(","));
  return filas;
}

// VALIDACIÓN DE CLIENTES
async function validarCliente() {
  const id = document.getElementById("idCliente").value.trim();
  const mensaje = document.getElementById("mensaje");
  
  if (!id) {
    mensaje.innerHTML = "<p class='error'>Escribí tu ID de cliente</p>";
    return;
  }

  mensaje.innerHTML = "<p class='cargando'>Verificando tu clave...</p>";
  
  try {
    const datos = await cargarCSV(URL_CLIENTES);
    let encontrado = false;
    let enlace = "";

    // Recorremos desde la fila 1 (saltamos encabezado)
    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i];
      if (fila[0]?.trim() === id) {
        encontrado = true;
        enlace = fila[6]?.trim(); // Columna G = Link_Descarga
        break;
      }
    }

    if (encontrado && enlace) {
      mensaje.innerHTML = "<p class='exito'>✅ ¡Clave correcta! Abriendo tu carpeta...</p>";
      setTimeout(() => window.open(enlace, "_blank"), 1500);
    } else {
      mensaje.innerHTML = "<p class='error'>❌ ID inválido. Verifícalo o escribinos por WhatsApp</p>";
    }
  } catch (error) {
    mensaje.innerHTML = "<p class='error'>⚠️ Error de conexión. Intentá nuevamente en unos minutos</p>";
  }
}

// VALIDACIÓN DE COMERCIO AMIGO
async function validarComercio() {
  const id = document.getElementById("idComercio").value.trim();
  const mensaje = document.getElementById("mensaje");
  
  if (!id) {
    mensaje.innerHTML = "<p class='error'>Escribí tu ID de comercio</p>";
    return;
  }

  mensaje.innerHTML = "<p class='cargando'>Verificando tu clave...</p>";
  
  try {
    const datos = await cargarCSV(URL_COMERCIOS);
    let encontrado = false;
    let enlace = "";

    // Recorremos desde la fila 1 (saltamos encabezado)
    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i];
      if (fila[0]?.trim() === id) {
        encontrado = true;
        enlace = fila[4]?.trim(); // Columna E = Enlace_carpeta
        break;
      }
    }

    if (encontrado && enlace) {
      mensaje.innerHTML = "<p class='exito'>✅ ¡Clave correcta! Abriendo tu carpeta...</p>";
      setTimeout(() => window.open(enlace, "_blank"), 1500);
    } else {
      mensaje.innerHTML = "<p class='error'>❌ ID inválido. Verifícalo o escribinos por WhatsApp</p>";
    }
  } catch (error) {
    mensaje.innerHTML = "<p class='error'>⚠️ Error de conexión. Intentá nuevamente en unos minutos</p>";
  }
}
