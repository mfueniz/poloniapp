-- poloniapp — schema inicial Supabase
-- Ver /Users/ignacio_aranguiz/.claude/plans/estuve-pensando-en-como-transient-bee.md
-- y DECISIONS.md (Ronda 7, 2026-08-30) para el contexto de estas decisiones.
--
-- Para revisar antes de correr: pensado para ejecutarse completo en el SQL editor
-- de un proyecto Supabase nuevo (free tier). Idempotente vía IF NOT EXISTS donde aplica.

-- =========================================================
-- EXTENSIONS
-- =========================================================
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- =========================================================
-- ADMINS (allowlist simple, 1-3 personas de confianza)
-- =========================================================
create table if not exists admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

-- Helper: ¿el usuario autenticado actual es admin?
create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from admins where user_id = auth.uid()
  );
$$;

-- =========================================================
-- SITE_CONTENT — textos fijos (hero, quiénes somos, footer, etc.)
-- =========================================================
create table if not exists site_content (
  key text primary key,          -- ej. 'hero.title', 'quienes_somos.objetivo'
  section text not null,         -- agrupador para el panel admin, ej. 'Hero', 'Quiénes somos'
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

-- =========================================================
-- CATEGORIES — las 7 categorías de actividades (+ Visitas/Colectas ocultas)
-- =========================================================
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  sort_order int not null default 0,
  visible boolean not null default true,
  bucket text check (bucket in ('formacion', 'laboral', 'familia')), -- null = fuera del esquema de chips (ej. Publicaciones)
  created_at timestamptz not null default now()
);

-- =========================================================
-- ACTIVITIES — actividad o serie
-- =========================================================
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories (id) on delete restrict,
  title text not null,
  description text,
  format text not null check (format in ('single', 'series')),
  photo_url text,
  visible boolean not null default true,
  contact_name text,   -- persona de contacto de esta actividad (ej. "Joaquín"), opcional
  contact_phone text,  -- si está vacío, el bubble de contacto cae al número general del centro
  created_at timestamptz not null default now()
);

-- =========================================================
-- LOCATIONS — nombre público + dirección real (dirección con gate de privacidad)
-- =========================================================
create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,      -- visible siempre, ej. "Las Condes"
  address text not null,   -- NO se expone vía select público, ver RLS + RPC más abajo
  created_at timestamptz not null default now()
);

-- =========================================================
-- SESSIONS — cada instancia con fecha (single = 1 fila, series = N filas)
-- =========================================================
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities (id) on delete cascade,
  date date,               -- null en sesiones recurrentes sin fecha absoluta (ver weekday)
  weekday text,            -- ej. 'Lunes' — solo para recurrentes (Círculos); null si hay date
  time_start time,
  time_end time,
  topic text,             -- tema de la sesión puntual (relevante en 'series')
  speaker text,
  location_id uuid references locations (id) on delete set null,
  price text,              -- texto libre, ej. "$10.000/matrimonio" — evita modelar moneda por ahora
  created_at timestamptz not null default now(),
  constraint sessions_date_or_weekday check (date is not null or weekday is not null)
);

-- =========================================================
-- REGISTRATIONS — inscripciones a una sesión (insert público, sin select público)
-- =========================================================
create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  created_at timestamptz not null default now()
);

-- =========================================================
-- POSTS — publicaciones de O. (migran las 3 ya hardcodeadas)
-- =========================================================
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  image_url text,
  external_url text unique not null,   -- unique: clave natural para evitar duplicados desde el scraper
  published_at date,
  source text default 'opusdei.org',
  visible boolean not null default true,
  created_at timestamptz not null default now()
);

-- =========================================================
-- DAILY_TEXTS — resultado del scraper diario
-- =========================================================
create table if not exists daily_texts (
  id uuid primary key default gen_random_uuid(),
  date date unique not null,
  title text not null,
  excerpt text not null,
  external_url text not null,
  scraped_at timestamptz not null default now()
);

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================
alter table site_content enable row level security;
alter table categories enable row level security;
alter table activities enable row level security;
alter table locations enable row level security;
alter table sessions enable row level security;
alter table registrations enable row level security;
alter table posts enable row level security;
alter table daily_texts enable row level security;
alter table admins enable row level security;

-- --- Lectura pública (anon + authenticated) ---
create policy "site_content: lectura pública" on site_content
  for select using (true);

create policy "categories: lectura pública de visibles" on categories
  for select using (visible = true or is_admin());

create policy "activities: lectura pública de visibles" on activities
  for select using (visible = true or is_admin());

create policy "sessions: lectura pública" on sessions
  for select using (true);

create policy "posts: lectura pública de visibles" on posts
  for select using (visible = true or is_admin());

create policy "daily_texts: lectura pública" on daily_texts
  for select using (true);

-- locations: SIN policy de select para anon -> address nunca es legible por API pública directa.
-- Solo admins la leen directo; el público la recibe vía la función register_and_reveal_address() (más abajo, security definer).
create policy "locations: solo admin lee directo" on locations
  for select using (is_admin());

-- registrations: nadie puede leer directo salvo admin (el insert público pasa por la función RPC, no por policy de insert directa)
create policy "registrations: solo admin lee" on registrations
  for select using (is_admin());

-- admins: solo admins pueden verse a sí mismos (evita filtrar la lista de admins al público)
create policy "admins: solo admin lee" on admins
  for select using (is_admin());

-- --- Escritura: solo admins, en todas las tablas de contenido ---
create policy "site_content: solo admin escribe" on site_content
  for all using (is_admin()) with check (is_admin());

create policy "categories: solo admin escribe" on categories
  for insert with check (is_admin());
create policy "categories: solo admin actualiza" on categories
  for update using (is_admin()) with check (is_admin());
create policy "categories: solo admin borra" on categories
  for delete using (is_admin());

create policy "activities: solo admin escribe" on activities
  for insert with check (is_admin());
create policy "activities: solo admin actualiza" on activities
  for update using (is_admin()) with check (is_admin());
create policy "activities: solo admin borra" on activities
  for delete using (is_admin());

create policy "locations: solo admin escribe" on locations
  for insert with check (is_admin());
create policy "locations: solo admin actualiza" on locations
  for update using (is_admin()) with check (is_admin());
create policy "locations: solo admin borra" on locations
  for delete using (is_admin());

create policy "sessions: solo admin escribe" on sessions
  for insert with check (is_admin());
create policy "sessions: solo admin actualiza" on sessions
  for update using (is_admin()) with check (is_admin());
create policy "sessions: solo admin borra" on sessions
  for delete using (is_admin());

create policy "posts: solo admin escribe" on posts
  for insert with check (is_admin());
create policy "posts: solo admin actualiza" on posts
  for update using (is_admin()) with check (is_admin());
create policy "posts: solo admin borra" on posts
  for delete using (is_admin());

create policy "daily_texts: solo admin escribe" on daily_texts
  for all using (is_admin()) with check (is_admin());
-- Nota: el scraper (GitHub Actions) usa la service_role key, que bypassea RLS por completo —
-- esta policy solo rige para accesos autenticados normales (ej. edición manual desde el panel admin).

-- registrations: el insert público NO pasa por policy directa de tabla, pasa por la función de abajo.
-- No se crea policy de "insert" pública a propósito, para forzar el flujo por la función.

-- admins: sin policy de insert/update/delete pública — se gestiona manualmente desde el SQL editor
-- (agregar un admin nuevo = 1-3 personas, no necesita UI).

-- =========================================================
-- RPC: register_and_reveal_address
-- Inserta la inscripción y devuelve la dirección real en la misma respuesta.
-- Es el único camino por el que un usuario público (anon) puede: (a) escribir en
-- registrations, y (b) enterarse de locations.address.
-- =========================================================
create or replace function register_and_reveal_address(
  p_session_id uuid,
  p_name text,
  p_email text,
  p_phone text default null
)
returns table (address text)
language plpgsql
security definer
as $$
begin
  insert into registrations (session_id, name, email, phone)
  values (p_session_id, p_name, p_email, p_phone);

  return query
    select l.address
    from sessions s
    join locations l on l.id = s.location_id
    where s.id = p_session_id;
end;
$$;

-- Permite ejecutar la función a usuarios anónimos y autenticados (la función
-- misma valida internamente vía security definer, no expone las tablas directo).
grant execute on function register_and_reveal_address(uuid, text, text, text) to anon, authenticated;
