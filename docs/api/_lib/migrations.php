<?php
// poloniapp — migraciones de la base. schema.sql + seed.sql son la versión 1; cada cambio
// posterior va aquí como una versión nueva, y la API la aplica sola (una vez) en el próximo
// request, tanto en instalaciones nuevas como en la base que ya está en producción.

declare(strict_types=1);

function migrations(): array
{
    return [
        // 2026-10-26: Para rezar hoy (automático), notificaciones push, inscripción por
        // WhatsApp o link, se ocultan Publicaciones, círculos nuevos y sin voseo en el contenido.
        2 => [
            "ALTER TABLE activities
               ADD COLUMN registration_whatsapp VARCHAR(50) NULL AFTER contact_phone,
               ADD COLUMN registration_url VARCHAR(1000) NULL AFTER registration_whatsapp",

            "CREATE TABLE IF NOT EXISTS prayer_items (
               day DATE NOT NULL,
               kind VARCHAR(20) NOT NULL,                -- gospel | meditation | dailytext
               title VARCHAR(500) NOT NULL,
               source VARCHAR(10) NOT NULL,              -- auto | fallback | manual
               detail VARCHAR(255) NULL,                 -- resultado de la última lectura de opusdei.org
               fetched_at DATETIME NOT NULL,
               PRIMARY KEY (day, kind)
             ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS push_subscriptions (
               id CHAR(36) NOT NULL PRIMARY KEY,
               endpoint_hash CHAR(64) NOT NULL UNIQUE,
               endpoint TEXT NOT NULL,
               p256dh VARCHAR(255) NULL,
               auth VARCHAR(255) NULL,
               created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
             ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            // Publicaciones de O. sale del sitio (la reemplaza "Para rezar hoy").
            "UPDATE categories SET visible = 0 WHERE slug = 'publicaciones'",

            "UPDATE categories SET description = 'Aprendes a ver a Cristo en el prójimo, con contacto inmediato y personal con el sufrimiento.'
             WHERE description = 'Aprendés a ver a Cristo en el prójimo, con contacto inmediato y personal con el sufrimiento.'",

            // Ubicaciones de los círculos.
            "UPDATE locations SET name = 'Polonia' WHERE name = 'Las Condes' AND address LIKE 'Polonia 306%'",
            "INSERT INTO locations (id, name, address)
             SELECT UUID(), 'Polonia', 'Polonia 306, Las Condes' FROM DUAL
             WHERE NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Polonia')",
            "INSERT INTO locations (id, name, address)
             SELECT UUID(), 'Uandes', 'Universidad de los Andes, Av. Monseñor Álvaro del Portillo 12.455, Las Condes' FROM DUAL
             WHERE NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Uandes')",
            "INSERT INTO locations (id, name, address)
             SELECT UUID(), 'CLA', 'CLA (completar dirección en el panel)' FROM DUAL
             WHERE NOT EXISTS (SELECT 1 FROM locations WHERE name = 'CLA')",

            // Círculos: se reemplazan los anteriores por los 7 vigentes (semanales, mismo día y hora).
            "DELETE a FROM activities a JOIN categories c ON c.id = a.category_id WHERE c.slug = 'circulos'",
            ...circle_statements([
                ['Lunes', '08:00', 'Polonia', 'José Manuel Parodi'],
                ['Martes', '08:00', 'Polonia', 'Cristián Cuevas'],
                ['Martes', '19:30', 'Polonia', 'Martín de la Barra'],
                ['Miércoles', '14:00', 'Uandes', 'Bernardo Pacheco'],
                ['Miércoles', '19:30', 'Polonia', 'Pablo Manterola'],
                ['Jueves', '14:00', 'Polonia', 'Alfonso Santini'],
                ['Viernes', '08:15', 'CLA', 'Humberto Crestuzzo'],
            ]),
        ],

        // 2026-10-27: ubicación fija "Polonia" o texto libre; Proyectos (Puentes y Encuentros
        // Matrimoniales) en Quiénes somos; categoría Encuentros Matrimoniales.
        3 => [
            "ALTER TABLE sessions ADD COLUMN location_text VARCHAR(255) NULL AFTER location_id",
            // Todo lo que no es Polonia pasa a texto libre (el panel ya no administra ubicaciones).
            "UPDATE sessions s JOIN locations l ON l.id = s.location_id
             SET s.location_text = l.name, s.location_id = NULL
             WHERE l.name <> 'Polonia'",

            "CREATE TABLE IF NOT EXISTS projects (
               id CHAR(36) NOT NULL PRIMARY KEY,
               slug VARCHAR(191) NOT NULL UNIQUE,
               title VARCHAR(255) NOT NULL,
               tagline VARCHAR(255) NULL,               -- ej. 'Santiago Centro'
               summary TEXT NULL,                       -- frase del inicio y bajada de la página
               logo_url VARCHAR(1000) NULL,
               sections MEDIUMTEXT NULL,                -- JSON: [{title, text, cards:[{title,text,meta}], buttons:[{label,url}]}]
               category_id CHAR(36) NULL,               -- actividades del proyecto (próximas / anteriores)
               upcoming_label VARCHAR(255) NULL,
               past_label VARCHAR(255) NULL,
               show_on_home TINYINT(1) NOT NULL DEFAULT 0,
               visible TINYINT(1) NOT NULL DEFAULT 1,
               sort_order INT NOT NULL DEFAULT 0,
               created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
               CONSTRAINT projects_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL
             ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "INSERT INTO categories (id, slug, name, description, sort_order, visible, bucket)
             SELECT UUID(), 'encuentros-matrimoniales', 'Encuentros Matrimoniales', NULL, 7, 1, NULL FROM DUAL
             WHERE NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'encuentros-matrimoniales')",
            "UPDATE activities SET category_id = (SELECT id FROM categories WHERE slug = 'encuentros-matrimoniales')
             WHERE title = 'Encuentro de Matrimonios'",

            'seed_projects',
        ],

        // 2026-10-27 (b): Encuentros Matrimoniales también en el inicio, sección Confesiones en
        // el inicio (textos editables en Contenido fijo) y logo de Puentes en alta resolución.
        4 => [
            "UPDATE projects SET show_on_home = 1 WHERE slug = 'encuentros-matrimoniales'",
            "UPDATE projects SET logo_url = 'assets/img/proyectos/puentes.png' WHERE logo_url = 'assets/img/proyectos/puentes-logo.png'",
            "INSERT IGNORE INTO site_content (`key`, section, value) VALUES
               ('confesiones.titulo', 'Confesiones', 'Confesiones'),
               ('confesiones.texto', 'Confesiones', 'Agenda para confesiones o hablar con un sacerdote')",
            "UPDATE site_content SET value = 'https://poloniasub35.setmore.com/' WHERE `key` = 'confesiones.booking_url' AND value = 'https://poloniasub35.setmore.com'",
        ],

        // 2026-10-27 (c): URL de cada actividad con su nombre (/actividad/retiro-de-noviembre) y
        // círculos sin imagen, con título sin día ni hora (la hora se muestra aparte).
        5 => [
            "ALTER TABLE activities ADD COLUMN slug VARCHAR(191) NULL AFTER title, ADD UNIQUE KEY activities_slug (slug)",
            "UPDATE activities a JOIN categories c ON c.id = a.category_id SET a.photo_url = NULL WHERE c.slug = 'circulos'",
            'rename_circles_and_fill_slugs',
        ],

        // 2026-10-27 (d): contenido completo de Puentes desde su presentación.
        6 => [
            'update_puentes_from_presentation',
        ],

        // 2026-11-08: tres categorías principales (Formación / Trabajo / Familia, en
        // categories.bucket) y las categorías de antes pasan a ser etiquetas dentro de ellas;
        // círculos ocultos por ahora; Proyectos queda solo con Puentes.
        7 => [
            "UPDATE categories SET bucket = 'formacion' WHERE slug IN ('circulos', 'retiros', 'confesiones', 'charlas-formacion', 'visitas-pobres', 'colectas')",
            "UPDATE categories SET bucket = 'laboral' WHERE slug = 'charlas-profesionales'",
            "UPDATE categories SET bucket = 'familia' WHERE slug IN ('matrimonio-familia', 'encuentros-matrimoniales')",
            // Etiquetas creadas desde el panel que no tenían grupo: quedan en Formación (se cambia en el panel).
            "UPDATE categories SET bucket = 'formacion' WHERE bucket IS NULL AND slug <> 'publicaciones'",
            "UPDATE activities a JOIN categories c ON c.id = a.category_id SET a.visible = 0 WHERE c.slug = 'circulos'",
            "UPDATE projects SET visible = 0, show_on_home = 0 WHERE slug = 'encuentros-matrimoniales'",
        ],

        // 2026-11-08 (b): actividades reales. Fechas de los afiches para las que se habían
        // movido a noviembre de prueba, se oculta el retiro mensual de prueba y se cargan el
        // Curso de Retiro (13–15 nov, Algarrobo) y El precio del éxito (3 nov).
        8 => [
            'load_real_activities',
        ],

        // 2026-11-09: "Qué hacemos" (Quiénes somos) pasa a ser texto editable en Contenido fijo.
        // Parte con lo mismo que hoy se arma solo (categorías con sus etiquetas en uso).
        9 => [
            'seed_que_hacemos',
        ],
    ];
}

function seed_que_hacemos(): void
{
    $pdo = db();
    $tags = $pdo->query(
        'SELECT c.name, c.bucket FROM categories c
         WHERE c.visible = 1 AND EXISTS (SELECT 1 FROM activities a WHERE a.category_id = c.id AND a.visible = 1)
         ORDER BY c.sort_order'
    )->fetchAll();
    $lines = [];
    foreach (['formacion' => 'Formación', 'laboral' => 'Trabajo', 'familia' => 'Familia'] as $bucket => $label) {
        $names = array_column(array_filter($tags, function ($t) use ($bucket) {
            return $t['bucket'] === $bucket;
        }), 'name');
        $lines[] = '**' . $label . '**' . ($names ? ': ' . implode(', ', $names) : '');
    }
    $insert = $pdo->prepare('INSERT IGNORE INTO site_content (`key`, section, value) VALUES (?, ?, ?)');
    $insert->execute(['quienes_somos.que_hacemos_titulo', 'Quiénes somos', 'Qué hacemos']);
    $insert->execute(['quienes_somos.que_hacemos', 'Quiénes somos', implode("\n", $lines)]);
}

function load_real_activities(): void
{
    $pdo = db();
    $find = function (string $slug, string $title) use ($pdo) {
        $st = $pdo->prepare('SELECT id FROM activities WHERE slug = ? OR title = ? LIMIT 1');
        $st->execute([$slug, $title]);
        return $st->fetchColumn() ?: null;
    };
    $polonia = $pdo->query("SELECT id FROM locations WHERE name = 'Polonia' LIMIT 1")->fetchColumn() ?: null;
    $addSession = $pdo->prepare(
        'INSERT INTO sessions (id, activity_id, date, time_start, time_end, topic, speaker, location_id, location_text, price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $session = function (string $activityId, string $date, ?string $start, ?string $end = null, ?string $topic = null, ?string $speaker = null, ?string $place = null, ?string $price = null) use ($addSession, $polonia) {
        // $place null = Polonia (ubicación fija); si no, texto libre.
        $addSession->execute([uuid(), $activityId, $date, $start, $end, $topic, $speaker, $place ? null : $polonia, $place ?: ($polonia ? null : 'Polonia'), $price]);
    };
    $replaceSessions = function (string $activityId) use ($pdo) {
        $pdo->prepare('DELETE FROM sessions WHERE activity_id = ?')->execute([$activityId]);
    };

    // Catolicismo, Ciclo 2: los 5 encuentros del afiche (julio y agosto, 19:15, Polonia)
    if ($id = $find('catolicismo-ciclo-2-cristo-nos-salva', 'Catolicismo — Ciclo 2: Cristo nos salva')) {
        $replaceSessions($id);
        foreach ([
            ['2026-07-09', 'La Revelación y la Fe: Dios se comunica; el hombre responde'],
            ['2026-07-23', 'Jesucristo: vida y enseñanza'],
            ['2026-07-30', 'La Santísima Trinidad: el amor de Dios'],
            ['2026-08-13', 'Cristo nos salva: su muerte y resurrección'],
            ['2026-08-20', 'Cristo vive: la oración y los sacramentos'],
        ] as [$date, $topic]) {
            $session($id, $date, '19:15', null, $topic);
        }
        $title = 'Catolicismo: profundizar la fe — Ciclo 2';
        $pdo->prepare("UPDATE activities SET title = ?, format = 'series', slug = ? WHERE id = ?")
            ->execute([$title, unique_slug('activities', $title, $id), $id]);
    }

    // Encuentro de Matrimonios: 13 de agosto y 3 de septiembre (Cerro Colorado)
    if ($id = $find('encuentro-de-matrimonios', 'Encuentro de Matrimonios')) {
        $replaceSessions($id);
        $place = 'Las Condes — Cerro Colorado';
        $session($id, '2026-08-13', '20:30', '21:30', 'Transmisión de la fe en la familia', 'Ronald Bown', $place, '$10.000 por matrimonio, para la comida');
        $session($id, '2026-09-03', '20:30', '21:30', 'La educación de hijos hombres e hijas mujeres', 'Álvaro Ibáñez', $place, '$10.000 por matrimonio, para la comida');
    }

    // Optimal Work: solo su fecha real (1 de mayo); se quitan las agregadas de prueba
    if ($id = $find('optimal-work', 'Optimal Work')) {
        $pdo->prepare("DELETE FROM sessions WHERE activity_id = ? AND date >= '2026-11-01'")->execute([$id]);
    }

    // Retiro de Agosto: martes 11 y miércoles 12, 19:15 a 20:45
    if ($id = $find('retiro-de-agosto', 'Retiro de Agosto')) {
        $replaceSessions($id);
        $session($id, '2026-08-11', '19:15', '20:45');
        $session($id, '2026-08-12', '19:15', '20:45');
    }

    // Retiro mensual de prueba: se oculta (se puede volver a mostrar desde el panel)
    $pdo->prepare("UPDATE activities SET visible = 0 WHERE slug = 'retiro-mensual-de-noviembre' OR title = 'Retiro Mensual de noviembre'")->execute();

    // Etiqueta "Cursos de retiro" (Formación), distinta de los retiros mensuales
    $pdo->exec("INSERT INTO categories (id, slug, name, sort_order, visible, bucket)
                SELECT UUID(), 'cursos-de-retiro', 'Cursos de retiro', COALESCE(MAX(sort_order), 0) + 1, 1, 'formacion' FROM categories
                WHERE NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'cursos-de-retiro')");
    $tag = function (string $slug) use ($pdo) {
        $st = $pdo->prepare('SELECT id FROM categories WHERE slug = ?');
        $st->execute([$slug]);
        return $st->fetchColumn() ?: null;
    };
    $insert = $pdo->prepare(
        'INSERT INTO activities (id, category_id, title, slug, description, format, photo_url, visible, registration_whatsapp)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)'
    );

    if (!$find('curso-de-retiro', 'Curso de Retiro') && ($cat = $tag('cursos-de-retiro'))) {
        $id = uuid();
        $insert->execute([
            $id, $cat, 'Curso de Retiro', unique_slug('activities', 'Curso de Retiro', $id),
            'Tres días de retiro en Algarrobo, del viernes 13 al domingo 15 de noviembre. Cupos limitados. Inscripciones con Pablo Manterola. «¿No ves que te está esperando… desde hace tanto tiempo?» (San Josemaría)',
            'series', 'assets/activities/curso-de-retiro-2026.webp', '+56 9 6607 1053',
        ]);
        $session($id, '2026-11-13', null, null, null, null, 'Algarrobo', '$50.000');
        $session($id, '2026-11-14', null, null, null, null, 'Algarrobo');
        $session($id, '2026-11-15', null, null, null, null, 'Algarrobo');
    }

    if (!$find('el-precio-del-exito', 'El precio del éxito') && ($cat = $tag('charlas-profesionales'))) {
        $id = uuid();
        $insert->execute([
            $id, $cat, 'El precio del éxito', unique_slug('activities', 'El precio del éxito', $id),
            'Ciclo de conversaciones con Ignacio Ruiz-Tagle. Cupos limitados.',
            'single', 'assets/activities/el-precio-del-exito.webp', null,
        ]);
        $session($id, '2026-11-03', '20:00', null, null, 'Ignacio Ruiz-Tagle', null, 'CLP 5.000 para la comida');
    }
}

/**
 * Secciones de Puentes según la presentación "Proyecto_Puentes_REV_GVU.pptx": punto de partida
 * (Parroquia San Andrés), los 3 pilares, el detalle de cada uno con sus inscripciones y cómo
 * ayudar. Se conservan la frase, el logo y los links que ya tuvieran los botones de ayuda.
 */
function update_puentes_from_presentation(): void
{
    $st = db()->prepare("SELECT id, sections FROM projects WHERE slug = 'puentes'");
    $st->execute();
    $project = $st->fetch();
    if (!$project) {
        return;
    }
    $links = [];
    foreach (json_decode((string) $project['sections'], true) ?: [] as $section) {
        foreach ($section['buttons'] ?? [] as $b) {
            $links[mb_lower((string) ($b['label'] ?? ''))] = (string) ($b['url'] ?? '');
        }
    }
    $img = 'assets/img/proyectos/';
    $sections = [
        [
            'title' => 'Nuestro punto de partida',
            'image' => $img . 'puentes-parroquia.webp',
            'text' => "**Parroquia San Andrés**, en Santiago Centro.",
            'cards' => [],
            'buttons' => [],
        ],
        [
            'title' => '3 pilares',
            'text' => '',
            'cards' => [
                ['title' => 'Familia', 'text' => 'Fortalecer el proyecto de familia para matrimonios jóvenes.', 'meta' => 'Una vez al mes'],
                ['title' => 'Trabajo', 'text' => 'Mejorar la gestión de negocios de emprendedores y ayudar en la reinserción laboral de profesionales.', 'meta' => 'Mensual presencial + sesiones online'],
                ['title' => 'Vivienda', 'text' => 'Reparar casas para asegurar condiciones dignas para vivir.', 'meta' => 'Sábados en la mañana'],
            ],
            'buttons' => [],
        ],
        [
            'title' => 'Familia',
            'image' => $img . 'puentes-familia.webp',
            'text' => "**Objetivo:** fortalecer el proyecto de familia para matrimonios jóvenes.\n\n**Modalidad:**\n- Espacio de conversación entre matrimonios\n- Invitados con temas de interés\n\n**Frecuencia:** una vez al mes.\n\n“Una oportunidad de vivir la fe en familia”. ¡Invitadísimos!\n\n**Inscripciones:**\nIgnacio Aránguiz +569 5371 9944\nJoaquín Ulloa +569 9962 6217",
            'cards' => [],
            'buttons' => [],
        ],
        [
            'title' => 'Trabajo',
            'image' => $img . 'puentes-trabajo.webp',
            'text' => "**Objetivos:**\n- Mejorar la gestión del negocio para emprendedores\n- Ayudar en la reinserción laboral de profesionales\n\n**Modalidad:**\n- Acompañamiento a profesionales y emprendedores\n- Talleres según temática (finanzas, administración…)\n\n**Frecuencia:**\n- Una vez al mes presencial\n- Sesiones online semanales individuales\n\n**Inscripciones:**\nMartín Fuenzalida +569 7373 4206\nJosé I. Guzmán +569 7708 9186",
            'cards' => [],
            'buttons' => [],
        ],
        [
            'title' => 'Vivienda',
            'image' => $img . 'puentes-vivienda.webp',
            'text' => "**Objetivo:** reparar casas para asegurar condiciones dignas para vivir.\n\n**Modalidad:** evaluar las viviendas más afectadas, recolectar donaciones y ejecutar las reparaciones con ayuda de voluntarios.\n\n**Frecuencia:** sábados en la mañana, a definir de acuerdo a la necesidad.\n\n“Una oportunidad de mejorar la calidad de vida de las familias”.\n\n**Inscripciones:**\nTomás Massman +569 9175 0169\nFrancisco Álvarez +569 9140 1610",
            'cards' => [],
            'buttons' => [],
        ],
        [
            'title' => '¿Cómo ayudar al proyecto?',
            'text' => '',
            'cards' => [],
            'buttons' => array_map(function ($label) use ($links) {
                return ['label' => $label, 'url' => $links[mb_lower($label)] ?? ''];
            }, ['Voluntario', 'Difusión', 'Donación']),
        ],
    ];
    db()->prepare('UPDATE projects SET sections = ? WHERE id = ?')
        ->execute([json_encode($sections, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $project['id']]);
}

/** "Círculo — martes 08:00" -> "Círculo en Polonia", y slug para todas las actividades. */
function rename_circles_and_fill_slugs(): void
{
    $circles = db()->query(
        "SELECT a.id, COALESCE(l.name, s.location_text) AS place
         FROM activities a
         JOIN categories c ON c.id = a.category_id AND c.slug = 'circulos'
         LEFT JOIN sessions s ON s.activity_id = a.id
         LEFT JOIN locations l ON l.id = s.location_id
         WHERE a.title LIKE 'Círculo — %'"
    )->fetchAll();
    $rename = db()->prepare('UPDATE activities SET title = ? WHERE id = ?');
    foreach ($circles as $c) {
        $rename->execute([$c['place'] ? 'Círculo en ' . $c['place'] : 'Círculo', $c['id']]);
    }
    $setSlug = db()->prepare('UPDATE activities SET slug = ? WHERE id = ?');
    $firstSession = db()->prepare('SELECT weekday, date, time_start FROM sessions WHERE activity_id = ? ORDER BY date, time_start LIMIT 1');
    // Primero se reserva el nombre "limpio" para quien lo tenga único; los repetidos (ej. varios
    // "Círculo en Polonia") llevan día y hora: circulo-en-polonia-martes-1930.
    $all = db()->query('SELECT id, title FROM activities ORDER BY created_at, title')->fetchAll();
    $count = array_count_values(array_map(function ($a) {
        return slugify($a['title']);
    }, $all));
    foreach ($all as $a) {
        $firstSession->execute([$a['id']]);
        $session = $firstSession->fetch() ?: null;
        $slug = $count[slugify($a['title'])] > 1 && $session
            ? unique_slug('activities', [$a['title'] . ' ' . ($session['weekday'] ?: $session['date']) . ' ' . str_replace(':', '', substr((string) $session['time_start'], 0, 5))], $a['id'])
            : activity_slug($a['id'], $a['title'], $session);
        $setSlug->execute([$slug, $a['id']]);
    }
}

/** Contenido inicial de Proyectos (después se edita en el panel, pestaña Proyectos). */
function seed_projects(): void
{
    $categoryId = db()->query("SELECT id FROM categories WHERE slug = 'encuentros-matrimoniales'")->fetchColumn() ?: null;
    $projects = [
        [
            'slug' => 'puentes',
            'title' => 'Puentes',
            'tagline' => 'Santiago Centro',
            'summary' => 'Somos un proyecto que trabaja en torno a **3 pilares fundamentales** para fortalecer a las familias de Santiago Centro y juntos acercarnos más a Cristo.',
            'logo_url' => 'assets/img/proyectos/puentes.png',
            'sections' => [
                [
                    'title' => 'Nuestros pilares',
                    'text' => '',
                    'cards' => [
                        ['title' => 'Familia', 'text' => 'Fortalecer el proyecto de familia para matrimonios jóvenes.', 'meta' => '1 vez al mes en Parroquia San Andrés'],
                        ['title' => 'Trabajo', 'text' => 'Acompañamiento a emprendedores y apoyo en reinserción laboral con talleres y mentoría.', 'meta' => 'Mensual + sesiones online'],
                        ['title' => 'Vivienda', 'text' => 'Reparación de casas para asegurar condiciones dignas de vida.', 'meta' => 'Sábados por la mañana'],
                    ],
                    'buttons' => [],
                ],
                [
                    'title' => '¿Cómo puedes ayudar?',
                    'text' => '',
                    'cards' => [],
                    'buttons' => [['label' => 'Voluntario', 'url' => ''], ['label' => 'Difusión', 'url' => ''], ['label' => 'Donación', 'url' => '']],
                ],
                [
                    'title' => '¡Súmate al proyecto!',
                    'text' => "**Familia:** Ignacio +569 5371 9944 · Joaquín +569 9962 6217
**Trabajo:** Martín +569 7373 4206 · José Ignacio +569 7708 9186
**Vivienda:** Tomás +569 9175 0169 · Francisco +569 9140 1610",
                    'cards' => [],
                    'buttons' => [],
                ],
            ],
            'category_id' => null,
            'show_on_home' => 1,
            'sort_order' => 1,
        ],
        [
            'slug' => 'encuentros-matrimoniales',
            'title' => 'Encuentros Matrimoniales',
            'tagline' => 'Matrimonios jóvenes',
            'summary' => 'Encuentros semanales para matrimonios jóvenes. Cada encuentro comienza con una charla de ayuda para formar una familia cristiana, acompañado siempre de una comida donde los participantes comparten sus experiencias.',
            'logo_url' => null,
            'sections' => [],
            'category_id' => $categoryId,
            'show_on_home' => 0,
            'sort_order' => 2,
        ],
    ];
    $st = db()->prepare(
        'INSERT IGNORE INTO projects (id, slug, title, tagline, summary, logo_url, sections, category_id, upcoming_label, past_label, show_on_home, visible, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)'
    );
    foreach ($projects as $p) {
        $st->execute([
            uuid(), $p['slug'], $p['title'], $p['tagline'], $p['summary'], $p['logo_url'],
            json_encode($p['sections'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            $p['category_id'], 'Próximos encuentros', 'Encuentros anteriores', $p['show_on_home'], $p['sort_order'],
        ]);
    }
}

/** Cada círculo = 1 actividad + 1 sesión recurrente (el responsable va como "speaker"). */
function circle_statements(array $circles): array
{
    $out = [];
    foreach ($circles as [$weekday, $time, $location, $person]) {
        $title = 'Círculo — ' . strtolower($weekday) . ' ' . $time; // strtolower solo toca ASCII: 'Miércoles' -> 'miércoles'
        $out[] = "INSERT INTO activities (id, category_id, title, description, format, photo_url, visible)
                  SELECT UUID(), id, '$title', NULL, 'single', NULL, 1 FROM categories WHERE slug = 'circulos'";
        $out[] = "INSERT INTO sessions (id, activity_id, weekday, time_start, speaker, location_id)
                  SELECT UUID(), a.id, '$weekday', '$time', '$person', l.id FROM activities a, locations l
                  WHERE a.title = '$title' AND l.name = '$location'";
    }
    return $out;
}

function latest_schema_version(): int
{
    return max(array_keys(migrations()));
}

function setting(string $name): ?string
{
    $st = db()->prepare('SELECT value FROM settings WHERE name = ?');
    $st->execute([$name]);
    $v = $st->fetchColumn();
    return $v === false ? null : (string) $v;
}

function set_setting(string $name, string $value): void
{
    db()->prepare('INSERT INTO settings (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)')
        ->execute([$name, $value]);
}

/** Aplica las migraciones pendientes. Barato si no hay nada que hacer (1 consulta). */
function migrate(): void
{
    $pdo = db();
    $pdo->exec("CREATE TABLE IF NOT EXISTS settings (
        name VARCHAR(100) NOT NULL PRIMARY KEY,
        value MEDIUMTEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    if ((int) (setting('schema_version') ?? 1) >= latest_schema_version()) {
        return;
    }
    // Un solo proceso migra a la vez (dos visitas simultáneas no aplican lo mismo dos veces).
    if ((int) $pdo->query("SELECT GET_LOCK('poloniapp_migrate', 20)")->fetchColumn() !== 1) {
        throw new ApiError('La base de datos se está actualizando, intenta de nuevo en unos segundos.', 503);
    }
    try {
        $version = (int) (setting('schema_version') ?? 1);
        foreach (migrations() as $target => $statements) {
            if ($target <= $version) {
                continue;
            }
            foreach ($statements as $step) {
                // Un paso es SQL, o el nombre de una función PHP (para datos con comillas, JSON, etc.).
                if (preg_match('/^[a-z_]+$/', $step) && function_exists($step)) {
                    $step();
                } else {
                    $pdo->exec($step);
                }
            }
            set_setting('schema_version', (string) $target);
        }
    } finally {
        $pdo->query("SELECT RELEASE_LOCK('poloniapp_migrate')");
    }
}
