-- poloniapp — contenido inicial (traducción a MySQL de supabase/seed.sql).
-- La API lo corre solo si la tabla categories está vacía (instalación nueva).
-- Cada sentencia termina en ";" al final de la línea: el instalador separa por ahí.

INSERT IGNORE INTO site_content (`key`, section, value) VALUES
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
  ('confesiones.booking_url', 'Confesiones', 'https://poloniasub35.setmore.com');

INSERT IGNORE INTO categories (id, slug, name, description, sort_order, visible, bucket) VALUES
  (UUID(), 'circulos', 'Círculos', NULL, 1, 1, 'formacion'),
  (UUID(), 'retiros', 'Retiros', NULL, 2, 1, 'formacion'),
  (UUID(), 'confesiones', 'Confesiones', NULL, 3, 1, 'formacion'),
  (UUID(), 'charlas-formacion', 'Charlas de formación', NULL, 4, 1, 'formacion'),
  (UUID(), 'charlas-profesionales', 'Charlas profesionales', NULL, 5, 1, 'laboral'),
  (UUID(), 'matrimonio-familia', 'Matrimonio y Familia', NULL, 6, 1, 'familia'),
  (UUID(), 'publicaciones', 'Publicaciones', NULL, 7, 1, NULL),
  (UUID(), 'visitas-pobres', 'Visitas a los pobres de la Virgen', 'Aprendés a ver a Cristo en el prójimo, con contacto inmediato y personal con el sufrimiento.', 8, 0, 'formacion'),
  (UUID(), 'colectas', 'Colectas', 'Una manera de dar de lo tuyo para colaborar con las necesidades del centro y del voluntariado.', 9, 0, 'formacion');

INSERT INTO locations (id, name, address) VALUES
  (UUID(), 'Las Condes', 'Polonia 306, Las Condes'),
  (UUID(), 'Las Condes — Cerro Colorado', 'Cerro Colorado 4700, dpto 175, Las Condes'),
  (UUID(), 'Antullanca', 'Antullanca, Lo Barnechea');

-- Círculos (recurrentes, sin foto propia -> placeholder símbolo)
INSERT INTO activities (id, category_id, title, description, format, photo_url, visible)
SELECT UUID(), id, 'Círculo — lunes', NULL, 'single', NULL, 1 FROM categories WHERE slug = 'circulos';

INSERT INTO activities (id, category_id, title, description, format, photo_url, visible)
SELECT UUID(), id, 'Círculo — martes noche', NULL, 'single', NULL, 1 FROM categories WHERE slug = 'circulos';

INSERT INTO sessions (id, activity_id, weekday, time_start, location_id)
SELECT UUID(), a.id, 'Lunes', '08:00', l.id FROM activities a, locations l
WHERE a.title = 'Círculo — lunes' AND l.name = 'Las Condes';

INSERT INTO sessions (id, activity_id, weekday, time_start, location_id)
SELECT UUID(), a.id, 'Martes', '19:30', l.id FROM activities a, locations l
WHERE a.title = 'Círculo — martes noche' AND l.name = 'Las Condes';

-- Retiro de Agosto
INSERT INTO activities (id, category_id, title, description, format, photo_url, visible)
SELECT UUID(), id, 'Retiro de Agosto', 'Incluye confesiones.', 'single', 'assets/activities/retiro-agosto.jpg', 1 FROM categories WHERE slug = 'retiros';

INSERT INTO sessions (id, activity_id, date, time_start, time_end, location_id)
SELECT UUID(), a.id, '2026-08-11', '19:15', '20:45', l.id FROM activities a, locations l
WHERE a.title = 'Retiro de Agosto' AND l.name = 'Las Condes';

-- Catolicismo — Ciclo 2 (serie)
INSERT INTO activities (id, category_id, title, description, format, photo_url, visible)
SELECT UUID(), id, 'Catolicismo — Ciclo 2: Cristo nos salva', 'Formación para jóvenes profesionales.', 'series', 'assets/activities/catolicismo-ciclo2.jpg', 1 FROM categories WHERE slug = 'charlas-formacion';

INSERT INTO sessions (id, activity_id, date, time_start, location_id)
SELECT UUID(), a.id, '2026-08-13', '19:15', l.id FROM activities a, locations l
WHERE a.title = 'Catolicismo — Ciclo 2: Cristo nos salva' AND l.name = 'Las Condes';

-- Optimal Work (serie)
INSERT INTO activities (id, category_id, title, description, format, photo_url, visible)
SELECT UUID(), id, 'Optimal Work', 'Programa de neurociencia/psicología aplicada. Incluye mentoring y conversatorio.', 'series', 'assets/activities/optimal-work.jpg', 1 FROM categories WHERE slug = 'charlas-profesionales';

INSERT INTO sessions (id, activity_id, date, time_start, location_id)
SELECT UUID(), a.id, '2026-05-01', '20:00', l.id FROM activities a, locations l
WHERE a.title = 'Optimal Work' AND l.name = 'Las Condes';

-- Encuentro de Matrimonios (serie)
INSERT INTO activities (id, category_id, title, description, format, photo_url, visible)
SELECT UUID(), id, 'Encuentro de Matrimonios', NULL, 'series', 'assets/activities/encuentro-matrimonios-sept.jpg', 1 FROM categories WHERE slug = 'matrimonio-familia';

INSERT INTO sessions (id, activity_id, date, time_start, time_end, topic, speaker, location_id, price)
SELECT UUID(), a.id, '2026-08-13', '20:30', '21:30', 'Transmisión de la fe en la familia', 'Ronald Bown', l.id, '$10.000/matrimonio' FROM activities a, locations l
WHERE a.title = 'Encuentro de Matrimonios' AND l.name = 'Las Condes — Cerro Colorado';

INSERT INTO sessions (id, activity_id, date, time_start, time_end, topic, speaker, location_id, price)
SELECT UUID(), a.id, '2026-09-03', '20:30', '21:30', 'Educación de hijos e hijas', 'Álvaro Ibáñez', l.id, '$10.000/matrimonio' FROM activities a, locations l
WHERE a.title = 'Encuentro de Matrimonios' AND l.name = 'Las Condes — Cerro Colorado';

-- Jornada Matrimonio y Familia (evento único anual)
INSERT INTO activities (id, category_id, title, description, format, photo_url, visible)
SELECT UUID(), id, 'Jornada Matrimonio y Familia', '6ª edición. Incluye guardería y misa.', 'single', 'assets/activities/jornada-matrimonio-familia.jpg', 1 FROM categories WHERE slug = 'matrimonio-familia';

INSERT INTO sessions (id, activity_id, date, time_start, time_end, location_id, price)
SELECT UUID(), a.id, '2026-05-30', '09:00', '17:00', l.id, '$30.000/familia' FROM activities a, locations l
WHERE a.title = 'Jornada Matrimonio y Familia' AND l.name = 'Antullanca';

-- Publicaciones de O.
INSERT IGNORE INTO posts (id, title, image_url, external_url, source) VALUES
  (UUID(), 'El Padre en Uruguay: “La santidad consiste en la plenitud del amor, no en no tener defectos”', 'assets/posts/uruguay.jpg', 'https://opusdei.org/es-cl/article/viaje-prelado-fernando-ocariz-uruguay/', 'opusdei.org'),
  (UUID(), 'Tres días con el Padre en Honduras: los mejores momentos', 'assets/posts/honduras.jpg', 'https://opusdei.org/es-cl/article/viaje-prelado-fernando-ocariz-honduras/', 'opusdei.org'),
  (UUID(), 'San Agustín de Hipona: biografía y comentarios al evangelio', 'assets/posts/san-agustin.jpg', 'https://opusdei.org/es-cl/article/san-agustin-de-hipona/', 'opusdei.org');
