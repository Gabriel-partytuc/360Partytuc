const API_BASE = "https://vps-5990632-x.dattaweb.com/webhook/reservas";
const WHATSAPP_NUMERO = "543814187925";
const CARRITO_STORAGE_KEY = "party360_carrito";
const CARRITO_TTL_MIN = 30;

let catalogo = { combos: [], individuales: [] };
let localidades = [];
let carrito = cargarCarritoGuardado();
let comboEnEleccion = null;
let servicioParaAdicionales = null;
let adicionalesInfo = {};
let modalAbiertoPorClick = false;

function guardarCarrito() {
  localStorage.setItem(CARRITO_STORAGE_KEY, JSON.stringify({ items: carrito, expira: Date.now() + CARRITO_TTL_MIN * 60 * 1000 }));
}

function cargarCarritoGuardado() {
  try {
    const raw = localStorage.getItem(CARRITO_STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!data.expira || Date.now() > data.expira) return [];
    return data.items || [];
  } catch (e) {
    return [];
  }
}

function formatoPrecio(n) {
  return "$" + Number(n || 0).toLocaleString("es-AR");
}

function datosEvento() {
  return {
    fecha: document.getElementById("fecha").value,
    horaDesde: document.getElementById("horaDesde").value,
    horaHasta: document.getElementById("horaHasta").value,
    localidad: document.getElementById("localidad").value
  };
}

async function cargarLocalidades() {
  try {
    const res = await fetch(`${API_BASE}/localidades`);
    const data = await res.json();
    localidades = data.localidades || [];
    const select = document.getElementById("localidad");
    localidades.forEach(l => {
      const opt = document.createElement("option");
      opt.value = l.nombre;
      opt.textContent = l.nombre;
      select.appendChild(opt);
    });
  } catch (e) {
    console.error("Error cargando localidades", e);
  }
}

async function cargarCatalogo() {
  const { fecha, horaDesde, horaHasta } = datosEvento();
  const params = new URLSearchParams();
  if (fecha && horaDesde && horaHasta) {
    params.set("fecha", fecha);
    params.set("horaDesde", horaDesde);
    params.set("horaHasta", horaHasta);
  }
  try {
    const res = await fetch(`${API_BASE}/catalogo?${params.toString()}`);
    const data = await res.json();
    catalogo = data;
    renderCatalogo();
  } catch (e) {
    console.error("Error cargando catálogo", e);
  }
}

function idsEnCarrito() {
  const ids = new Set();
  carrito.forEach(it => {
    if (it.tipo === "adicional") return;
    ids.add(it.idServicio);
    (it.elecciones || []).forEach(id => ids.add(id));
  });
  return ids;
}

function crearCardServicio(servicio, esCombo) {
  const enCarrito = idsEnCarrito().has(servicio.id);
  const card = document.createElement("div");
  card.className = "tarjeta-servicio";
  card.tabIndex = 0;

  const badge = servicio.disponible === null
    ? ""
    : `<span class="badge-disponibilidad ${servicio.disponible ? "badge-disponible" : "badge-no-disponible"}">${servicio.disponible ? "✅ Disponible" : "❌ Sin stock"}</span>`;

  card.innerHTML = `
    <div class="zona-preview">
      <h3>${servicio.nombre}</h3>
      <p class="descripcion">${servicio.descripcion || ""}</p>
      ${badge}
      <p class="precio">${formatoPrecio(servicio.precio)}</p>
    </div>
    <button class="boton-agregar" ${enCarrito || servicio.disponible === false ? "disabled" : ""}>
      ${enCarrito ? "Ya en el carrito" : "Agregar al carrito"}
    </button>
  `;

  const zonaPreview = card.querySelector(".zona-preview");
  let hoverTimer = null;
  zonaPreview.addEventListener("mouseenter", () => {
    hoverTimer = setTimeout(() => mostrarModalFotos(servicio, false), 350);
  });
  zonaPreview.addEventListener("mouseleave", () => {
    clearTimeout(hoverTimer);
    if (!modalAbiertoPorClick) cerrarModalFotos();
  });
  zonaPreview.addEventListener("click", () => mostrarModalFotos(servicio, true));

  const boton = card.querySelector(".boton-agregar");
  boton.addEventListener("click", () => {
    if (esCombo) {
      iniciarEleccionCombo(servicio);
    } else {
      agregarAlCarrito({ idServicio: servicio.id, tipo: "individual", elecciones: [], adicionales: [] });
      abrirFlujoAdicionales(servicio);
    }
  });

  return card;
}

function renderCatalogo() {
  const gridCombos = document.getElementById("grid-combos");
  const gridIndividuales = document.getElementById("grid-individuales");
  gridCombos.innerHTML = "";
  gridIndividuales.innerHTML = "";
  (catalogo.combos || []).forEach(c => gridCombos.appendChild(crearCardServicio(c, true)));
  (catalogo.individuales || []).forEach(s => gridIndividuales.appendChild(crearCardServicio(s, false)));
}

function mostrarModalFotos(servicio, porClick) {
  const modal = document.getElementById("modal-fotos");
  document.getElementById("modal-fotos-titulo").textContent = servicio.nombre;
  const img = document.getElementById("modal-fotos-img");
  img.src = (servicio.fotos && servicio.fotos[0]) || "img/placeholder-servicio.svg";
  modal.classList.add("abierto");
  modalAbiertoPorClick = !!porClick;
}

function cerrarModalFotos() {
  document.getElementById("modal-fotos").classList.remove("abierto");
  modalAbiertoPorClick = false;
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("cerrar-modal").addEventListener("click", cerrarModalFotos);
  document.getElementById("modal-fotos").addEventListener("click", (ev) => {
    if (ev.target.id === "modal-fotos") cerrarModalFotos();
  });
  document.getElementById("modal-fotos").addEventListener("mouseleave", () => {
    if (!modalAbiertoPorClick) cerrarModalFotos();
  });

  document.getElementById("fecha").addEventListener("change", cargarCatalogo);
  document.getElementById("horaDesde").addEventListener("change", cargarCatalogo);
  document.getElementById("horaHasta").addEventListener("change", cargarCatalogo);
  document.getElementById("localidad").addEventListener("change", () => {
    actualizarBarraCarrito();
    if (document.getElementById("carrito-drawer").classList.contains("abierto")) renderDrawerCarrito();
  });

  document.getElementById("btn-ver-carrito").addEventListener("click", () => abrirCarrito());
  document.getElementById("cerrar-drawer").addEventListener("click", () => cerrarCarrito());
  document.getElementById("btn-ir-direccion").addEventListener("click", () => {
    cerrarCarrito();
    mostrarPaso("paso-direccion");
  });
  document.getElementById("btn-continuar-adicionales").addEventListener("click", () => {
    document.getElementById("paso-adicionales").classList.remove("activo");
  });
  document.getElementById("btn-confirmar-reserva").addEventListener("click", () => confirmarReserva());

  cargarLocalidades();
  cargarCatalogo();
  actualizarBarraCarrito();
});

function agregarAlCarrito(item) {
  carrito.push(item);
  guardarCarrito();
  actualizarBarraCarrito();
  renderCatalogo();
}

function quitarDelCarrito(index) {
  carrito.splice(index, 1);
  guardarCarrito();
  actualizarBarraCarrito();
  renderDrawerCarrito();
  renderCatalogo();
}

function costoLocalidadActual() {
  const nombre = document.getElementById("localidad").value;
  if (!nombre) return 0;
  const loc = localidades.find(l => l.nombre === nombre);
  return loc ? Number(loc.costoAdicional) || 0 : 0;
}

function totalCarritoEstimado() {
  const catalogoCompleto = [...catalogo.combos, ...catalogo.individuales];
  let total = 0;
  carrito.forEach(it => {
    if (it.tipo === "adicional") {
      total += Number(adicionalesInfo[it.idServicio]?.precio) || 0;
    } else {
      const s = catalogoCompleto.find(x => x.id === it.idServicio);
      if (s) total += Number(s.precio) || 0;
    }
  });
  total += costoLocalidadActual();
  return total;
}

function actualizarBarraCarrito() {
  const barra = document.getElementById("carrito-barra");
  barra.style.display = carrito.length > 0 ? "flex" : "none";
  document.getElementById("carrito-cantidad").textContent = carrito.length;
  document.getElementById("carrito-total").textContent = formatoPrecio(totalCarritoEstimado());
}

function abrirCarrito() {
  renderDrawerCarrito();
  document.getElementById("carrito-drawer").classList.add("abierto");
}

function cerrarCarrito() {
  document.getElementById("carrito-drawer").classList.remove("abierto");
}

function renderDrawerCarrito() {
  const lista = document.getElementById("lista-carrito");
  lista.innerHTML = "";
  const catalogoCompleto = [...catalogo.combos, ...catalogo.individuales];
  carrito.forEach((it, idx) => {
    let nombre;
    if (it.tipo === "adicional") {
      nombre = adicionalesInfo[it.idServicio]?.nombre || it.idServicio;
    } else {
      const s = catalogoCompleto.find(x => x.id === it.idServicio);
      nombre = s ? s.nombre : it.idServicio;
    }
    const div = document.createElement("div");
    div.className = "item-carrito";
    div.innerHTML = `<span>${nombre}</span><button class="quitar">✕</button>`;
    div.querySelector(".quitar").addEventListener("click", () => quitarDelCarrito(idx));
    lista.appendChild(div);
  });
  const costoLocalidad = costoLocalidadActual();
  if (costoLocalidad > 0) {
    const div = document.createElement("div");
    div.className = "item-carrito";
    div.innerHTML = `<span>Adicional por distancia (${document.getElementById("localidad").value})</span><span>${formatoPrecio(costoLocalidad)}</span>`;
    lista.appendChild(div);
  }
  document.getElementById("drawer-total").textContent = formatoPrecio(totalCarritoEstimado());
}

function mostrarPaso(idPaso) {
  document.querySelectorAll(".paso").forEach(p => p.classList.remove("activo"));
  document.getElementById(idPaso).classList.add("activo");
  document.getElementById(idPaso).scrollIntoView({ behavior: "smooth" });
}

function avisarFaltanDatosEvento() {
  const panel = document.querySelector(".panel-datos");
  panel.scrollIntoView({ behavior: "smooth", block: "center" });
  panel.classList.add("panel-datos-error");
  setTimeout(() => panel.classList.remove("panel-datos-error"), 2000);
}

async function iniciarEleccionCombo(combo) {
  const { fecha, horaDesde, horaHasta } = datosEvento();
  if (!fecha || !horaDesde || !horaHasta) {
    avisarFaltanDatosEvento();
    return;
  }
  comboEnEleccion = combo;
  try {
    const res = await fetch(`${API_BASE}/opciones-eleccion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fecha, horaDesde, horaHasta, idCombo: combo.id, carritoIds: Array.from(idsEnCarrito()) })
    });
    const data = await res.json();
    if (!data.cantidadElecciones) {
      agregarAlCarrito({ idServicio: combo.id, tipo: "combo", elecciones: [], adicionales: [] });
      abrirFlujoAdicionales(combo);
      return;
    }
    renderEleccionCombo(data);
    mostrarPaso("paso-eleccion");
  } catch (e) {
    console.error("Error obteniendo opciones de elección", e);
  }
}

function renderEleccionCombo(data) {
  const cantidadElecciones = data.cantidadElecciones;
  const elegidos = [];
  let opcionesDisponibles = data.opciones || [];

  function pintar() {
    const cont = document.getElementById("lista-eleccion");
    cont.innerHTML = "";
    const titulo = document.querySelector("#paso-eleccion h2");
    if (titulo) {
      titulo.textContent = cantidadElecciones > 1
        ? `Elegí el servicio ${elegidos.length + 1} de ${cantidadElecciones} para tu combo`
        : "Elegí el servicio de tu combo";
    }
    opcionesDisponibles.forEach(op => {
      const card = document.createElement("div");
      card.className = "tarjeta-servicio";
      card.innerHTML = `
        <h3>${op.nombre}</h3>
        <p class="descripcion">${op.descripcion || ""}</p>
        <p class="precio">${formatoPrecio(op.precio)}</p>
        <button class="boton-agregar">Elegir</button>
      `;
      card.querySelector("button").addEventListener("click", () => {
        elegidos.push(op.id);
        opcionesDisponibles = opcionesDisponibles.filter(o => o.id !== op.id);
        if (elegidos.length >= cantidadElecciones) {
          agregarAlCarrito({ idServicio: comboEnEleccion.id, tipo: "combo", elecciones: elegidos, adicionales: [] });
          document.getElementById("paso-eleccion").classList.remove("activo");
          abrirFlujoAdicionales(comboEnEleccion);
        } else {
          pintar();
        }
      });
      cont.appendChild(card);
    });
  }

  pintar();
}

async function abrirFlujoAdicionales(servicio) {
  servicioParaAdicionales = servicio;
  try {
    const res = await fetch(`${API_BASE}/adicionales?idServicio=${encodeURIComponent(servicio.id)}`);
    const data = await res.json();
    const adicionales = data.adicionales || [];
    if (adicionales.length === 0) {
      document.getElementById("paso-adicionales").classList.remove("activo");
      return;
    }
    adicionales.forEach(a => { adicionalesInfo[a.id] = { nombre: a.nombre, precio: a.precio }; });

    const cont = document.getElementById("lista-adicionales");
    cont.innerHTML = "";
    adicionales.forEach(a => {
      const yaAgregado = carrito.some(it => it.tipo === "adicional" && it.idServicio === a.id);
      const label = document.createElement("label");
      label.innerHTML = `<input type="checkbox" value="${a.id}" ${yaAgregado ? "checked" : ""}> ${a.nombre} — ${formatoPrecio(a.precio)}`;
      const checkbox = label.querySelector("input");
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          carrito.push({ idServicio: a.id, tipo: "adicional", elecciones: [], adicionales: [] });
        } else {
          const idx = carrito.findIndex(it => it.tipo === "adicional" && it.idServicio === a.id);
          if (idx !== -1) carrito.splice(idx, 1);
        }
        guardarCarrito();
        actualizarBarraCarrito();
      });
      cont.appendChild(label);
    });
    mostrarPaso("paso-adicionales");
  } catch (e) {
    console.error("Error cargando adicionales", e);
  }
}

async function confirmarReserva() {
  const { fecha, horaDesde, localidad } = datosEvento();
  const direccion = document.getElementById("direccion").value.trim();
  const telefono = document.getElementById("telefono").value.trim();

  if (!fecha || !horaDesde || !localidad || !direccion || !telefono || carrito.length === 0) {
    alert("Completá fecha, horario, localidad, dirección, teléfono y agregá al menos un servicio al carrito.");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/confirmar-reserva`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fecha, horaDesde, direccion, localidad, telefono, carrito })
    });
    const data = await res.json();

    if (res.status === 409 || data.disponible === false) {
      alert("Uno de los servicios elegidos ya no tiene disponibilidad para ese horario. Volvé a revisar el catálogo.");
      cargarCatalogo();
      return;
    }

    carrito = [];
    localStorage.removeItem(CARRITO_STORAGE_KEY);
    actualizarBarraCarrito();

    document.getElementById("texto-id-reserva").textContent = data.idReserva;
    document.getElementById("link-whatsapp").href = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(data.mensajeWhatsapp)}`;
    mostrarPaso("paso-confirmacion");
  } catch (e) {
    console.error("Error confirmando reserva", e);
    alert("Hubo un error al confirmar la reserva. Probá de nuevo o escribinos por WhatsApp.");
  }
}
