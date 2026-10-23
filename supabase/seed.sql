-- poloniapp — seed de contenido inicial (migración de docs/index.html hardcodeado a Supabase)
-- Guardar en Supabase SQL Editor como: seed-contenido-inicial
-- Fuente: DECISIONS.md, NAVIGATION_BRIEF.md, y el HTML actual en producción.

-- =========================================================
-- SITE_CONTENT
-- =========================================================
insert into site_content (key, section, value) values
  ('hero.title', 'Hero', 'Que busques a Cristo, que encuentres a Cristo, que ames a Cristo.'),
  ('hero.subtitle', 'Hero', 'Buscar a Dios en la vida ordinaria, y darlo a conocer.'),
  ('quienes_somos.teaser', 'Quiénes somos', 'Centro cultural del Opus Dei en Las Condes. Círculos, retiros, charlas y confesiones, siempre en el trato de a uno.'),
  ('quienes_somos.objetivo', 'Quiénes somos', 'Buscar a Dios en la vida ordinaria, y darlo a conocer.'),
  ('quienes_somos.parrafo1', 'Quiénes somos', 'Somos un centro cultural en Las Condes donde profesionales jóvenes encuentran formación espiritual y humana. Funciona a puertas abiertas: se viene, se conversa, se vuelve.'),
  ('quienes_somos.imagen', 'Quiénes somos', ''),
  ('quienes_somos.parrafo2', 'Quiénes somos', 'El centro forma parte del Opus Dei. Buscar a Cristo, encontrarlo y amarlo — como lo resumía san Josemaría — es la idea que ordena toda la formación que ofrecemos: un plan adaptado a cada persona, que abarca lo humano, lo espiritual, lo doctrinal, lo profesional y lo apostólico. No hace falta llegar con todo resuelto: la actitud que proponemos es simple, comenzar y, cuando haga falta, recomenzar.'),
  ('contact.whatsapp', 'Contacto', '+56953719944'),
  ('contact.address', 'Contacto', 'Polonia 306, Las Condes'),
  ('contact.map_url', 'Contacto', 'https://maps.google.com/?q=Polonia+306,+Las+Condes'),
  ('confesiones.booking_url', 'Confesiones', 'https://poloniasub35.setmore.com')
on conflict (key) do nothing;

-- =========================================================
-- CATEGORIES (7 visibles + 2 ocultas: Visitas/Colectas)
-- =========================================================
insert into categories (slug, name, description, sort_order, visible, bucket) values
  ('circulos', 'Círculos', null, 1, true, 'formacion'),
  ('retiros', 'Retiros', null, 2, true, 'formacion'),
  ('confesiones', 'Confesiones', null, 3, true, 'formacion'),
  ('charlas-formacion', 'Charlas de formación', null, 4, true, 'formacion'),
  ('charlas-profesionales', 'Charlas profesionales', null, 5, true, 'laboral'),
  ('matrimonio-familia', 'Matrimonio y Familia', null, 6, true, 'familia'),
  ('publicaciones', 'Publicaciones', null, 7, true, null),
  ('visitas-pobres', 'Visitas a los pobres de la Virgen', 'Aprendés a ver a Cristo en el prójimo, con contacto inmediato y personal con el sufrimiento.', 8, false, 'formacion'),
  ('colectas', 'Colectas', 'Una manera de dar de lo tuyo para colaborar con las necesidades del centro y del voluntariado.', 9, false, 'formacion')
on conflict (slug) do nothing;

-- =========================================================
-- LOCATIONS
-- =========================================================
insert into locations (name, address) values
  ('Las Condes', 'Polonia 306, Las Condes'),
  ('Las Condes — Cerro Colorado', 'Cerro Colorado 4700, dpto 175, Las Condes'),
  ('Antullanca', 'Antullanca, Lo Barnechea')
on conflict do nothing;

-- =========================================================
-- ACTIVITIES + SESSIONS
-- =========================================================

-- Círculos (recurrentes, sin foto propia -> placeholder símbolo)
with c as (select id from categories where slug = 'circulos')
insert into activities (category_id, title, description, format, photo_url, visible)
select id, 'Círculo — lunes', null, 'single', null, true from c
union all
select id, 'Círculo — martes noche', null, 'single', null, true from c;

insert into sessions (activity_id, weekday, time_start, location_id)
select a.id, 'Lunes', '08:00', l.id
from activities a, locations l
where a.title = 'Círculo — lunes' and l.name = 'Las Condes';

insert into sessions (activity_id, weekday, time_start, location_id)
select a.id, 'Martes', '19:30', l.id
from activities a, locations l
where a.title = 'Círculo — martes noche' and l.name = 'Las Condes';

-- Retiro de Agosto
with c as (select id from categories where slug = 'retiros')
insert into activities (category_id, title, description, format, photo_url, visible)
select id, 'Retiro de Agosto', 'Incluye confesiones.', 'single', 'assets/activities/retiro-agosto.jpg', true from c;

insert into sessions (activity_id, date, time_start, time_end, location_id)
select a.id, '2026-08-11', '19:15', '20:45', l.id
from activities a, locations l
where a.title = 'Retiro de Agosto' and l.name = 'Las Condes';

-- Catolicismo — Ciclo 2 (serie)
with c as (select id from categories where slug = 'charlas-formacion')
insert into activities (category_id, title, description, format, photo_url, visible)
select id, 'Catolicismo — Ciclo 2: Cristo nos salva', 'Formación para jóvenes profesionales.', 'series', 'assets/activities/catolicismo-ciclo2.jpg', true from c;

insert into sessions (activity_id, date, time_start, location_id)
select a.id, '2026-08-13', '19:15', l.id
from activities a, locations l
where a.title = 'Catolicismo — Ciclo 2: Cristo nos salva' and l.name = 'Las Condes';

-- Optimal Work (serie)
with c as (select id from categories where slug = 'charlas-profesionales')
insert into activities (category_id, title, description, format, photo_url, visible)
select id, 'Optimal Work', 'Programa de neurociencia/psicología aplicada. Incluye mentoring y conversatorio.', 'series', 'assets/activities/optimal-work.jpg', true from c;

insert into sessions (activity_id, date, time_start, location_id)
select a.id, '2026-05-01', '20:00', l.id
from activities a, locations l
where a.title = 'Optimal Work' and l.name = 'Las Condes';

-- Encuentro de Matrimonios (serie)
with c as (select id from categories where slug = 'matrimonio-familia')
insert into activities (category_id, title, description, format, photo_url, visible)
select id, 'Encuentro de Matrimonios', null, 'series', 'assets/activities/encuentro-matrimonios-sept.jpg', true from c;

insert into sessions (activity_id, date, time_start, time_end, topic, speaker, location_id, price)
select a.id, '2026-08-13', '20:30', '21:30', 'Transmisión de la fe en la familia', 'Ronald Bown', l.id, '$10.000/matrimonio'
from activities a, locations l
where a.title = 'Encuentro de Matrimonios' and l.name = 'Las Condes — Cerro Colorado';

insert into sessions (activity_id, date, time_start, time_end, topic, speaker, location_id, price)
select a.id, '2026-09-03', '20:30', '21:30', 'Educación de hijos e hijas', 'Álvaro Ibáñez', l.id, '$10.000/matrimonio'
from activities a, locations l
where a.title = 'Encuentro de Matrimonios' and l.name = 'Las Condes — Cerro Colorado';

-- Jornada Matrimonio y Familia (evento único anual)
with c as (select id from categories where slug = 'matrimonio-familia')
insert into activities (category_id, title, description, format, photo_url, visible)
select id, 'Jornada Matrimonio y Familia', '6ª edición. Incluye guardería y misa.', 'single', 'assets/activities/jornada-matrimonio-familia.jpg', true from c;

insert into sessions (activity_id, date, time_start, time_end, location_id, price)
select a.id, '2026-05-30', '09:00', '17:00', l.id, '$30.000/familia'
from activities a, locations l
where a.title = 'Jornada Matrimonio y Familia' and l.name = 'Antullanca';

-- =========================================================
-- POSTS (publicaciones de O.)
-- =========================================================
insert into posts (title, image_url, external_url, source) values
  ('El Padre en Uruguay: “La santidad consiste en la plenitud del amor, no en no tener defectos”', 'assets/posts/uruguay.jpg', 'https://opusdei.org/es-cl/article/viaje-prelado-fernando-ocariz-uruguay/', 'opusdei.org'),
  ('Tres días con el Padre en Honduras: los mejores momentos', 'assets/posts/honduras.jpg', 'https://opusdei.org/es-cl/article/viaje-prelado-fernando-ocariz-honduras/', 'opusdei.org'),
  ('San Agustín de Hipona: biografía y comentarios al evangelio', 'assets/posts/san-agustin.jpg', 'https://opusdei.org/es-cl/article/san-agustin-de-hipona/', 'opusdei.org')
on conflict (external_url) do nothing;
