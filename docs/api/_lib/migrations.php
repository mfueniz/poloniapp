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
    ];
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
            foreach ($statements as $sql) {
                $pdo->exec($sql);
            }
            set_setting('schema_version', (string) $target);
        }
    } finally {
        $pdo->query("SELECT RELEASE_LOCK('poloniapp_migrate')");
    }
}
