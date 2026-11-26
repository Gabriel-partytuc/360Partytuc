import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// IP del cliente, hasheada (no se guarda la IP en claro) para el limitador de intentos.
async function claveIp(req: Request): Promise<string> {
  const ip = req.headers.get("cf-connecting-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "desconocida";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(buf)).slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function permitido(clave: string, max: number, ventanaSeg: number): Promise<boolean> {
  const { data, error } = await db.rpc("api_rate_limit", { p_clave: clave, p_max: max, p_ventana_seg: ventanaSeg });
  if (error) throw error;
  return data === true;
}

const peso = (n: number) => "$" + Number(n || 0).toLocaleString("es-AR");

function mensajeWhatsapp(r: any) {
  const lineas = (r.items as any[]).map((i) => `- ${i.nombre}: ${peso(i.precio)}`).join("\n");
  return [
    `Hola! Quiero confirmar mi reserva ${r.idReserva}.`,
    ``,
    `Nombre: ${r.nombre}`,
    `Teléfono: ${r.telefono}`,
    `Fecha: ${r.fecha}`,
    `Horario: ${r.horaDesde} a ${r.horaHasta}`,
    `Localidad: ${r.localidad}`,
    `Dirección: ${r.direccion}`,
    ``,
    `Servicios:`,
    lineas,
    r.costoLocalidad > 0 ? `Adicional por distancia: ${peso(r.costoLocalidad)}` : null,
    ``,
    `Total: ${peso(r.totalFinal)}`,
  ].filter((l) => l !== null).join("\n");
}

// Aviso al dueño por Telegram. Se activa solo si estan cargados los secretos
// TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID; si faltan o falla, no afecta la reserva.
async function avisarTelegram(r: any) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!token || !chatId) return;
  const texto = `Nueva reserva ${r.idReserva} (pendiente)\n\n` + mensajeWhatsapp(r).split("\n").slice(2).join("\n");
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: texto }),
    });
    if (!res.ok) console.error("Telegram respondio", res.status, await res.text());
  } catch (e) {
    console.error("Error enviando a Telegram", e);
  }
}

// Copia la reserva en la planilla de Google Sheets via un Apps Script (ver
// supabase/apps-script/reservas-sheet.gs). Se activa solo si estan cargados los
// secretos SHEETS_WEBHOOK_URL y SHEETS_WEBHOOK_TOKEN; si faltan o falla, no afecta la reserva.
// La copia es de una sola via: Supabase es la fuente de verdad.
async function copiarEnSheet(r: any) {
  const url = Deno.env.get("SHEETS_WEBHOOK_URL");
  const token = Deno.env.get("SHEETS_WEBHOOK_TOKEN");
  if (!url || !token) return;
  const creada = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  const filas = (r.items as any[]).map((i) => ({
    ID_Reserva: r.idReserva,
    Fecha_Evento: r.fecha,
    Hora_Desde: r.horaDesde,
    Hora_Hasta: r.horaHasta,
    Nombre_Cliente: r.nombre,
    Direccion: r.direccion,
    Localidad: r.localidad,
    ID_Servicio: i.id,
    Nombre_Servicio: i.nombre,
    Precio: i.precio,
    Telefono_Cliente: r.telefono,
    Contacto: r.telefono,
    Estado: "pendiente",
    Fecha_Creacion: creada,
    Total_Servicios: r.totalServicios,
    Total_Final: r.totalFinal,
    "Adicional Distancia": r.costoLocalidad,
    Pertenece_A_Combo: "",
  }));
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, filas }),
    });
    if (!res.ok) console.error("Sheets respondio", res.status, await res.text());
  } catch (e) {
    console.error("Error copiando a Sheets", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const ruta = new URL(req.url).pathname.replace(/\/+$/, "").split("/").pop();
  const url = new URL(req.url);

  try {
    if (req.method === "GET" && ruta === "localidades") {
      const { data, error } = await db.from("localidades").select("id,nombre,adicional_distancia").order("id");
      if (error) throw error;
      return json({ localidades: data.map((l) => ({ id: l.id, nombre: l.nombre, costoAdicional: Number(l.adicional_distancia) })) });
    }

    if (req.method === "GET" && ruta === "catalogo") {
      const q = url.searchParams;
      const { data, error } = await db.rpc("api_catalogo", {
        p_fecha: q.get("fecha") || null,
        p_desde: q.get("horaDesde") || null,
        p_hasta: q.get("horaHasta") || null,
      });
      if (error) throw error;
      return json(data);
    }

    if (req.method === "GET" && ruta === "adicionales") {
      const id = url.searchParams.get("idServicio") || "";
      const { data, error } = await db.from("adicionales").select("*").or(`id_servicio_asociado.eq.${id.replace(/[^\w-]/g, "")},id_servicio_asociado.eq.Todos`);
      if (error) throw error;
      return json({ adicionales: data.map((a) => ({ id: a.id, nombre: a.nombre, precio: Number(a.precio_extra), duracionMin: a.duracion_min })) });
    }

    if (req.method === "POST" && ruta === "confirmar-reserva") {
      let body: any;
      try { body = await req.json(); } catch { return json({ error: "JSON invalido" }, 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Solicitud invalida" }, 400);
      // Campo trampa: los bots lo completan, las personas no lo ven. Se responde "ok" sin guardar nada.
      if (typeof body.sitioWeb === "string" && body.sitioWeb.trim() !== "") {
        return json({ idReserva: "RES-0000", totalFinal: 0, mensajeWhatsapp: "Hola!", estado: "pendiente" });
      }
      // Limites: 5 reservas por hora por IP y 100 por hora en total.
      const ip = await claveIp(req);
      if (!(await permitido("res:" + ip, 5, 3600)) || !(await permitido("res:global", 100, 3600))) {
        return json({ error: "Demasiados intentos. Probá de nuevo más tarde o escribinos por WhatsApp." }, 429);
      }
      const { data, error } = await db.rpc("api_crear_reserva_validado", { p: body });
      if (error) throw error;
      if (!data.disponible) return json(data, 409);
      data.mensajeWhatsapp = mensajeWhatsapp(data);
      data.estado = "pendiente";
      await Promise.all([avisarTelegram(data), copiarEnSheet(data)]);
      return json({ idReserva: data.idReserva, totalFinal: data.totalFinal, mensajeWhatsapp: data.mensajeWhatsapp, estado: data.estado });
    }

    return json({ error: "Ruta no encontrada" }, 404);
  } catch (e) {
    console.error("Error en /" + ruta, e);
    return json({ error: "Error interno" }, 500);
  }
});
