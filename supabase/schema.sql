-- Esquema de la base de reservas de 360 Party (proyecto Supabase natxchgrtqvhsjfbsymp).
-- Referencia versionada: la fuente de verdad es la base en Supabase.
-- Los datos iniciales (servicios, adicionales, localidades) se editan desde el Table Editor.

create table public.servicios (
  id text primary key,
  nombre text not null,
  descripcion text not null default '',
  descripcion_ia text not null default '',
  precio_base numeric not null default 0,
  activo boolean not null default true,
  categoria text not null check (categoria in ('Individual','Combo')),
  ids_incluidos text not null default '',
  duracion_min int not null default 90,
  alquilable_solo boolean not null default true,
  cantidad int not null default 1,
  fotos text[] not null default '{}',
  consultar boolean not null default false -- true: no se reserva online, se consulta por WhatsApp
);

create table public.adicionales (
  id text primary key,
  nombre text not null,
  precio_extra numeric not null default 0,
  id_servicio_asociado text not null,
  duracion_min int not null default 0
);

create table public.localidades (
  id text primary key,
  nombre text not null unique,
  adicional_distancia numeric not null default 0
);

create sequence public.reserva_seq start 1;

create table public.reservas (
  id_reserva text primary key,
  fecha_evento date not null,
  hora_desde text not null,
  hora_hasta text not null,
  desde_min int not null,
  hasta_min int not null,
  nombre_cliente text not null,
  telefono_cliente text not null,
  direccion text not null,
  localidad text not null,
  total_servicios numeric not null,
  costo_localidad numeric not null default 0,
  total_final numeric not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','confirmada','cancelada')),
  created_at timestamptz not null default now()
);

create table public.reserva_items (
  id bigint generated always as identity primary key,
  id_reserva text not null references public.reservas(id_reserva) on delete cascade,
  id_servicio text not null,
  nombre text not null,
  tipo text not null check (tipo in ('servicio','adicional')),
  precio numeric not null
);
create index on public.reserva_items (id_reserva);
create index on public.reserva_items (id_servicio);
create index on public.reservas (fecha_evento, estado);

-- RLS cerrado: solo la Edge Function (service_role) accede.
alter table public.servicios enable row level security;
alter table public.adicionales enable row level security;
alter table public.localidades enable row level security;
alter table public.reservas enable row level security;
alter table public.reserva_items enable row level security;

-- Catalogo con disponibilidad. Solo las reservas 'confirmada' bloquean stock, con 60 min de buffer.
create or replace function public.api_catalogo(p_fecha date, p_desde text, p_hasta text)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  chequear boolean := p_fecha is not null and p_desde is not null and p_hasta is not null;
  ev_from int; ev_to int;
begin
  if chequear then
    ev_from := split_part(p_desde,':',1)::int*60 + split_part(p_desde,':',2)::int;
    ev_to := split_part(p_hasta,':',1)::int*60 + split_part(p_hasta,':',2)::int;
    if ev_to <= ev_from then ev_to := ev_to + 1440; end if;
  end if;
  return jsonb_build_object('combos','[]'::jsonb,'individuales', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'nombre', s.nombre, 'descripcion', s.descripcion_ia, 'precio', s.precio_base,
      'categoria', s.categoria, 'consultar', s.consultar, 'alquilableSolo', s.alquilable_solo, 'duracionMin', s.duracion_min,
      'stockDisponible', greatest(s.cantidad - coalesce(r.n,0), 0),
      'disponible', case when chequear and not s.consultar then greatest(s.cantidad - coalesce(r.n,0),0) > 0 else null end,
      'fotos', to_jsonb(s.fotos)) order by s.consultar, s.ctid)
    from public.servicios s
    left join lateral (
      select count(*) n from public.reserva_items i join public.reservas rv on rv.id_reserva = i.id_reserva
      where chequear and i.tipo='servicio' and i.id_servicio = s.id and rv.fecha_evento = p_fecha
        and rv.estado='confirmada' and not (ev_to + 60 <= rv.desde_min or rv.hasta_min + 60 <= ev_from)
    ) r on true
    where s.activo and s.categoria='Individual'
  ), '[]'::jsonb));
end $$;

-- Valida, chequea stock de forma atomica (advisory lock) y crea la reserva.
create or replace function public.api_crear_reserva(p jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_fecha date; v_desde text := p->>'horaDesde'; v_dir text := btrim(coalesce(p->>'direccion',''));
  v_loc text := btrim(coalesce(p->>'localidad','')); v_tel text := btrim(coalesce(p->>'telefono',''));
  v_nom text := btrim(coalesce(p->>'nombre',''));
  it jsonb; s public.servicios; a public.adicionales;
  v_items jsonb := '[]'::jsonb; v_ids text[] := '{}'; v_total numeric := 0; v_costo_loc numeric := 0;
  v_dur int := 90; v_extra int := 0; ev_from int; ev_to int; v_hasta text; v_id text; v_sin text[] := '{}';
  v_n int;
begin
  begin v_fecha := (p->>'fecha')::date; exception when others then v_fecha := null; end;
  if v_fecha is null or v_desde !~ '^\d{1,2}:\d{2}$' or v_dir = '' or v_tel = '' or v_nom = ''
     or jsonb_typeof(p->'carrito') <> 'array' or jsonb_array_length(p->'carrito') = 0
     or jsonb_array_length(p->'carrito') > 40 or length(v_nom||v_dir||v_tel) > 400 then
    return jsonb_build_object('disponible', false, 'error', 'Faltan datos obligatorios o son invalidos');
  end if;
  if v_fecha < (now() at time zone 'America/Argentina/Tucuman')::date then
    return jsonb_build_object('disponible', false, 'error', 'La fecha del evento ya paso');
  end if;

  select l.adicional_distancia into v_costo_loc from public.localidades l where l.nombre = v_loc;
  if not found then
    return jsonb_build_object('disponible', false, 'error', 'Localidad invalida');
  end if;

  perform pg_advisory_xact_lock(360);

  for it in select * from jsonb_array_elements(p->'carrito') loop
    if it->>'tipo' = 'adicional' then
      select * into a from public.adicionales where id = it->>'idServicio';
      if not found then return jsonb_build_object('disponible', false, 'error', 'Adicional inexistente: '||(it->>'idServicio')); end if;
      v_items := v_items || jsonb_build_object('id', a.id, 'nombre', a.nombre, 'tipo', 'adicional', 'precio', a.precio_extra);
      v_total := v_total + a.precio_extra; v_extra := v_extra + a.duracion_min;
    else
      select * into s from public.servicios where id = it->>'idServicio' and activo and not consultar and categoria = 'Individual';
      if not found then v_sin := v_sin || coalesce(it->>'idServicio','?'); continue; end if;
      if s.id = any(v_ids) then continue; end if;
      v_ids := v_ids || s.id;
      v_items := v_items || jsonb_build_object('id', s.id, 'nombre', s.nombre, 'tipo', 'servicio', 'precio', s.precio_base);
      v_total := v_total + s.precio_base;
      if s.duracion_min > v_dur then v_dur := s.duracion_min; end if;
    end if;
  end loop;

  ev_from := split_part(v_desde,':',1)::int*60 + split_part(v_desde,':',2)::int;
  ev_to := ev_from + v_dur + v_extra;

  for s in select * from public.servicios where id = any(v_ids) loop
    select count(*) into v_n from public.reserva_items i join public.reservas rv on rv.id_reserva = i.id_reserva
      where i.tipo='servicio' and i.id_servicio = s.id and rv.fecha_evento = v_fecha and rv.estado='confirmada'
        and not (ev_to + 60 <= rv.desde_min or rv.hasta_min + 60 <= ev_from);
    if s.cantidad - v_n <= 0 then v_sin := v_sin || s.id; end if;
  end loop;
  if array_length(v_sin,1) > 0 then
    return jsonb_build_object('disponible', false, 'error', 'Sin stock para: '||array_to_string(v_sin, ', '), 'itemsSinStock', to_jsonb(v_sin));
  end if;
  if array_length(v_ids,1) is null then
    return jsonb_build_object('disponible', false, 'error', 'El carrito no tiene servicios');
  end if;

  v_hasta := lpad(((ev_to % 1440)/60)::text,2,'0')||':'||lpad((ev_to % 60)::text,2,'0');
  v_id := 'RES-' || lpad(nextval('public.reserva_seq')::text, 4, '0');

  insert into public.reservas (id_reserva, fecha_evento, hora_desde, hora_hasta, desde_min, hasta_min, nombre_cliente,
    telefono_cliente, direccion, localidad, total_servicios, costo_localidad, total_final)
  values (v_id, v_fecha, lpad(split_part(v_desde,':',1),2,'0')||':'||split_part(v_desde,':',2), v_hasta, ev_from, ev_to, v_nom,
    v_tel, v_dir, v_loc, v_total, v_costo_loc, v_total + v_costo_loc);

  insert into public.reserva_items (id_reserva, id_servicio, nombre, tipo, precio)
  select v_id, x->>'id', x->>'nombre', x->>'tipo', (x->>'precio')::numeric from jsonb_array_elements(v_items) x;

  return jsonb_build_object('disponible', true, 'idReserva', v_id, 'fecha', v_fecha, 'horaDesde', v_desde, 'horaHasta', v_hasta,
    'nombre', v_nom, 'telefono', v_tel, 'direccion', v_dir, 'localidad', v_loc, 'items', v_items,
    'totalServicios', v_total, 'costoLocalidad', v_costo_loc, 'totalFinal', v_total + v_costo_loc);
end $$;

revoke all on function public.api_catalogo(date,text,text) from public, anon, authenticated;
revoke all on function public.api_crear_reserva(jsonb) from public, anon, authenticated;
grant execute on function public.api_catalogo(date,text,text) to service_role;
grant execute on function public.api_crear_reserva(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Acceso de clientes y comercios (reemplaza los CSV publicos de Google Sheets)
-- Se cargan/editan desde el Table Editor de Supabase. Usadas por la Edge Function `acceso`.
-- ---------------------------------------------------------------------------
create table public.clientes (
  id_cliente text primary key,
  nombre_evento text not null default '',
  nombre_cliente text not null default '',
  id_contrato text not null default '',
  lugar_evento text not null default '',
  whatsapp text not null default '',
  link_descarga text not null default '',
  orden text not null default ''
);
create table public.comercios (
  id_comercio text primary key,
  nombre_comercio text not null default '',
  domicilio text not null default '',
  telefono text not null default '',
  enlace_carpeta text not null default ''
);
alter table public.clientes enable row level security;
alter table public.comercios enable row level security;

-- Limitador de intentos por clave (IP hasheada + tipo)
create table public.rate_limit (
  clave text primary key,
  n int not null,
  ventana_inicio timestamptz not null
);
alter table public.rate_limit enable row level security;

create or replace function public.api_rate_limit(p_clave text, p_max int, p_ventana_seg int)
returns boolean language plpgsql set search_path = public as $$
declare v_n int;
begin
  delete from public.rate_limit where ventana_inicio < now() - interval '1 day';
  insert into public.rate_limit as r (clave, n, ventana_inicio) values (p_clave, 1, now())
  on conflict (clave) do update set
    n = case when r.ventana_inicio < now() - make_interval(secs => p_ventana_seg) then 1 else r.n + 1 end,
    ventana_inicio = case when r.ventana_inicio < now() - make_interval(secs => p_ventana_seg) then now() else r.ventana_inicio end
  returning n into v_n;
  return v_n <= p_max;
end $$;

-- Devuelve el link de la carpeta si el ID existe, o null
create or replace function public.api_acceso(p_tipo text, p_id text)
returns text language plpgsql stable set search_path = public as $$
declare v text;
begin
  if p_id is null or btrim(p_id) = '' or length(p_id) > 100 then return null; end if;
  if p_tipo = 'cliente' then
    select nullif(btrim(link_descarga), '') into v from public.clientes where id_cliente = btrim(p_id);
  elsif p_tipo = 'comercio' then
    select nullif(btrim(enlace_carpeta), '') into v from public.comercios where id_comercio = btrim(p_id);
  end if;
  return v;
end $$;

-- Validacion de telefono antes de crear la reserva
create or replace function public.api_crear_reserva_validado(p jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare v_tel text := btrim(coalesce(p->>'telefono',''));
begin
  if v_tel !~ '^[0-9+()\s.-]{6,25}$' or length(regexp_replace(v_tel, '\D', '', 'g')) < 6 then
    return jsonb_build_object('disponible', false, 'error', 'Telefono invalido');
  end if;
  return public.api_crear_reserva(p);
end $$;

revoke all on function public.api_rate_limit(text,int,int) from public, anon, authenticated;
revoke all on function public.api_acceso(text,text) from public, anon, authenticated;
revoke all on function public.api_crear_reserva_validado(jsonb) from public, anon, authenticated;
grant execute on function public.api_rate_limit(text,int,int) to service_role;
grant execute on function public.api_acceso(text,text) to service_role;
grant execute on function public.api_crear_reserva_validado(jsonb) to service_role;
