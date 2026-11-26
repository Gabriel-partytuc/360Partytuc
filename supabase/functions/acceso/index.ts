import { createClient } from "npm:@supabase/supabase-js@2";

// Acceso de clientes y comercios: recibe un ID y, si existe, devuelve el link de la carpeta.
// Los datos viven en las tablas `clientes` y `comercios` (RLS cerrado), ya no en un CSV publico.

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Metodo no permitido" }, 405);

  try {
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "JSON invalido" }, 400); }
    const tipo = body?.tipo;
    const id = typeof body?.id === "string" ? body.id : "";
    if ((tipo !== "cliente" && tipo !== "comercio") || !id) return json({ ok: false }, 400);

    // Anti fuerza bruta: 10 intentos cada 10 min por IP y 100 cada 10 min en total.
    const ip = await claveIp(req);
    if (!(await permitido("acc:" + ip, 10, 600)) || !(await permitido("acc:global", 100, 600))) {
      return json({ ok: false, error: "Demasiados intentos. Esperá unos minutos." }, 429);
    }

    const { data, error } = await db.rpc("api_acceso", { p_tipo: tipo, p_id: id });
    if (error) throw error;
    if (!data) return json({ ok: false });
    return json({ ok: true, enlace: data });
  } catch (e) {
    console.error("Error en acceso", e);
    return json({ error: "Error interno" }, 500);
  }
});
