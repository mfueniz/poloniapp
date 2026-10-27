<?php
// poloniapp — API propia (PHP + MySQL), reemplaza a Supabase.
//
// Público:   GET  ?action=public         todo lo que necesita el sitio en una sola llamada
//            GET  ?action=prayer         "Para rezar hoy" (títulos del día de opusdei.org)
//            GET  ?action=push_key|push_message   POST ?action=subscribe|unsubscribe
//            GET  ?action=status         ¿hay sesión de admin? ¿falta crear el primer admin?
// Admin:     POST ?action=setup          crea las tablas + el primer admin (solo si no hay ninguno)
//            POST ?action=login|logout
//            GET  ?action=list&table=X
//            POST ?action=save&table=X   con id = update, sin id = insert
//            POST ?action=delete&table=X
//            POST ?action=upload         imagen (multipart, campo "file") -> uploads/
//            POST ?action=category_create   categoría nueva desde el selector de actividades
//            POST ?action=save_activity     actividad + todas sus sesiones en un solo guardado
//            POST ?action=admin_add|admin_delete|password   gestión de administradores
//            GET  ?action=prayer_admin|stats   POST ?action=prayer_refresh|prayer_override|push_test
//
// Las credenciales de la base viven en config.php, que genera el workflow de deploy desde los
// GitHub Secrets (nunca va en el repo). Ver config.sample.php.

declare(strict_types=1);

date_default_timezone_set('America/Santiago');

require __DIR__ . '/_lib/migrations.php';
require __DIR__ . '/_lib/prayer.php';
require __DIR__ . '/_lib/push.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

// Columnas editables por tabla desde el panel. Nada fuera de esta lista se escribe nunca.
const TABLES = [
    'site_content' => ['pk' => 'key', 'cols' => ['value'], 'order' => 'section, `key`'],
    'categories' => ['pk' => 'id', 'cols' => ['slug', 'name', 'description', 'sort_order', 'bucket', 'visible'], 'order' => 'sort_order'],
    'locations' => ['pk' => 'id', 'cols' => ['name', 'address'], 'order' => 'name'],
    'activities' => ['pk' => 'id', 'cols' => ['category_id', 'title', 'description', 'format', 'photo_url', 'visible', 'registration_whatsapp', 'registration_url'], 'order' => 'title'],
    'sessions' => ['pk' => 'id', 'cols' => ['activity_id', 'date', 'weekday', 'time_start', 'time_end', 'topic', 'speaker', 'location_id', 'location_text', 'price'], 'order' => 'date, time_start'],
    'projects' => ['pk' => 'id', 'cols' => ['slug', 'title', 'tagline', 'summary', 'logo_url', 'sections', 'category_id', 'upcoming_label', 'past_label', 'show_on_home', 'visible', 'sort_order'], 'order' => 'sort_order, title'],
];

const UPLOAD_TYPES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

class ApiError extends Exception
{
}

function respond($data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo) {
        return $pdo;
    }
    $configFile = __DIR__ . '/config.php';
    if (!is_file($configFile)) {
        throw new ApiError('Falta api/config.php en el servidor (lo genera el deploy desde los secrets DB_*).', 500);
    }
    $c = require $configFile;
    try {
        $pdo = new PDO(
            sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $c['db_host'] ?? 'localhost', $c['db_name']),
            $c['db_user'],
            $c['db_pass'],
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_STRINGIFY_FETCHES => false,
            ]
        );
    } catch (PDOException $e) {
        error_log('[poloniapp api] ' . $e->getMessage());
        throw new ApiError('No se pudo conectar a la base de datos MySQL (revisa los secrets DB_* del deploy).', 500);
    }
    return $pdo;
}

function uuid(): string
{
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}

function body(): array
{
    $data = json_decode(file_get_contents('php://input') ?: '[]', true);
    return is_array($data) ? $data : [];
}

function q(string $col): string
{
    return '`' . str_replace('`', '', $col) . '`';
}

// ---------------------------------------------------------------------------
// Sesión de admin (cookie httponly + SameSite=Strict; además todo POST exige el header
// X-Poloniapp, que un formulario o sitio ajeno no puede mandar sin CORS -> sin CSRF).
// ---------------------------------------------------------------------------
function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_name('poloniapp_admin');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $secure, 'httponly' => true, 'samesite' => 'Strict']);
    session_start();
}

function current_admin(): ?array
{
    start_session();
    $id = $_SESSION['admin_id'] ?? null;
    if (!$id) {
        return null;
    }
    $st = db()->prepare('SELECT id, email FROM admins WHERE id = ?');
    $st->execute([$id]);
    return $st->fetch() ?: null;
}

function require_admin(): array
{
    $admin = current_admin();
    if (!$admin) {
        throw new ApiError('Debes iniciar sesión.', 401);
    }
    return $admin;
}

function log_in(array $admin): void
{
    start_session();
    session_regenerate_id(true);
    $_SESSION['admin_id'] = $admin['id'];
}

// ---------------------------------------------------------------------------
// Instalación: crea las tablas y, si la base está vacía, carga el contenido inicial.
// ---------------------------------------------------------------------------
function run_sql_file(string $file): void
{
    $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents($file));
    foreach (preg_split('/;\s*$/m', $sql) as $statement) {
        if (trim($statement) !== '') {
            db()->exec($statement);
        }
    }
}

function is_installed(): bool
{
    return (bool) db()->query("SHOW TABLES LIKE 'admins'")->fetch();
}

function install(): void
{
    run_sql_file(__DIR__ . '/_lib/schema.sql');
    if ((int) db()->query('SELECT COUNT(*) FROM categories')->fetchColumn() === 0) {
        run_sql_file(__DIR__ . '/_lib/seed.sql');
    }
}

/** Conecta y aplica migraciones pendientes (una vez por request). */
function ensure_schema(): void
{
    static $done = false;
    if (!$done) {
        $done = true;
        if (is_installed()) {
            migrate();
        }
    }
}

function needs_setup(): bool
{
    return !is_installed() || (int) db()->query('SELECT COUNT(*) FROM admins')->fetchColumn() === 0;
}

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------
function attach_sessions(array $activities): array
{
    $byActivity = [];
    foreach (db()->query('SELECT * FROM sessions ORDER BY date, time_start') as $s) {
        $byActivity[$s['activity_id']][] = $s;
    }
    foreach ($activities as &$a) {
        $a['sessions'] = $byActivity[$a['id']] ?? [];
    }
    return $activities;
}

function public_payload(): array
{
    $pdo = db();
    $content = [];
    foreach ($pdo->query('SELECT `key`, value FROM site_content') as $row) {
        $content[$row['key']] = $row['value'];
    }
    return [
        'content' => $content,
        'categories' => $pdo->query('SELECT * FROM categories WHERE visible = 1 ORDER BY sort_order')->fetchAll(),
        'activities' => attach_sessions($pdo->query('SELECT * FROM activities WHERE visible = 1')->fetchAll()),
        // Solo el nombre: la dirección real nunca sale por la API pública.
        'locations' => $pdo->query('SELECT id, name FROM locations')->fetchAll(),
        'projects' => decode_sections($pdo->query('SELECT * FROM projects WHERE visible = 1 ORDER BY sort_order, title')->fetchAll()),
    ];
}

function list_table(string $table): array
{
    if ($table === 'admins') {
        return db()->query('SELECT id, email, created_at FROM admins ORDER BY email')->fetchAll();
    }
    if ($table === 'registrations') {
        return db()->query(
            "SELECT r.id, r.name, r.email, r.phone, DATE_FORMAT(r.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
                    s.date AS session_date, s.weekday AS session_weekday, s.time_start AS session_time_start,
                    a.title AS activity_title
             FROM registrations r
             LEFT JOIN sessions s ON s.id = r.session_id
             LEFT JOIN activities a ON a.id = s.activity_id
             ORDER BY r.created_at DESC"
        )->fetchAll();
    }
    $cfg = table_config($table);
    $rows = db()->query('SELECT * FROM ' . q($table) . ' ORDER BY ' . $cfg['order'])->fetchAll();
    if ($table === 'activities') {
        return attach_sessions($rows);
    }
    return $table === 'projects' ? decode_sections($rows) : $rows;
}

function decode_sections(array $projects): array
{
    foreach ($projects as &$p) {
        $p['sections'] = json_decode((string) $p['sections'], true) ?: [];
    }
    return $projects;
}

/** "Encuentros Matrimoniales" -> "encuentros-matrimoniales" */
function slugify(string $text): string
{
    $text = strtr(mb_lower($text), ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n']);
    return trim(preg_replace('/[^a-z0-9]+/', '-', $text), '-');
}

function mb_lower(string $s): string
{
    return function_exists('mb_strtolower') ? mb_strtolower($s, 'UTF-8') : strtr(strtolower($s), ['Á' => 'á', 'É' => 'é', 'Í' => 'í', 'Ó' => 'ó', 'Ú' => 'ú', 'Ü' => 'ü', 'Ñ' => 'ñ']);
}

/** Crea una categoría (o reactiva una oculta con el mismo nombre) y devuelve su id. */
function create_category(array $input): array
{
    $name = trim((string) ($input['name'] ?? ''));
    $slug = slugify($name);
    if ($name === '' || $slug === '') {
        throw new ApiError('Escribe el nombre de la categoría.', 400);
    }
    $st = db()->prepare('SELECT id FROM categories WHERE slug = ?');
    $st->execute([$slug]);
    if ($id = $st->fetchColumn()) {
        db()->prepare('UPDATE categories SET visible = 1 WHERE id = ?')->execute([$id]);
        return ['id' => $id, 'name' => $name];
    }
    $id = uuid();
    db()->prepare(
        'INSERT INTO categories (id, slug, name, sort_order, visible) SELECT ?, ?, ?, COALESCE(MAX(sort_order), 0) + 1, 1 FROM categories'
    )->execute([$id, $slug, $name]);
    return ['id' => $id, 'name' => $name];
}

// ---------------------------------------------------------------------------
// Escrituras
// ---------------------------------------------------------------------------
function table_config(string $table): array
{
    if (!isset(TABLES[$table])) {
        throw new ApiError('Tabla desconocida.', 400);
    }
    return TABLES[$table];
}

function save_row(string $table, array $input, array $admin): array
{
    $cfg = table_config($table);
    $values = [];
    foreach ($cfg['cols'] as $col) {
        if (array_key_exists($col, $input)) {
            $v = $input[$col];
            $values[$col] = is_bool($v) ? (int) $v : (is_array($v) ? json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : $v);
        }
    }
    if ($table === 'projects' && array_key_exists('slug', $values)) {
        $values['slug'] = slugify((string) ($values['slug'] ?: ($values['title'] ?? '')));
        if ($values['slug'] === '') {
            throw new ApiError('El proyecto necesita un nombre.', 400);
        }
    }
    if ($table === 'site_content') {
        $values['updated_by'] = $admin['id'];
    }
    $id = $input[$cfg['pk']] ?? null;
    // La URL de la actividad sale de su nombre (/actividad/retiro-de-noviembre).
    if ($table === 'activities' && isset($values['title'])) {
        $values['slug'] = unique_slug('activities', (string) $values['title'], $id ?: null);
    }
    $created = false;

    if ($id !== null && $id !== '') {
        if (!$values) {
            throw new ApiError('Nada que guardar.', 400);
        }
        $sets = implode(', ', array_map(function ($c) {
            return q($c) . ' = ?';
        }, array_keys($values)));
        $st = db()->prepare('UPDATE ' . q($table) . " SET $sets WHERE " . q($cfg['pk']) . ' = ?');
        $st->execute(array_merge(array_values($values), [$id]));
    } else {
        if ($table === 'site_content') {
            throw new ApiError('Los textos fijos solo se editan, no se crean desde el panel.', 400);
        }
        $id = uuid();
        $values = ['id' => $id] + $values;
        $cols = implode(', ', array_map('q', array_keys($values)));
        $marks = implode(', ', array_fill(0, count($values), '?'));
        db()->prepare('INSERT INTO ' . q($table) . " ($cols) VALUES ($marks)")->execute(array_values($values));
        $created = true;
    }
    $result = [$cfg['pk'] => $id, 'created' => $created];
    if (isset($values['slug'])) {
        $result['slug'] = $values['slug'];
    }
    return $result;
}

/**
 * Primer slug libre entre los textos candidatos (ej. el nombre, y si se repite, el nombre con
 * día y hora); si todos están tomados, el primero con -2, -3…
 */
function unique_slug(string $table, $texts, ?string $excludeId): string
{
    $st = db()->prepare('SELECT 1 FROM ' . q($table) . ' WHERE slug = ? AND id <> ?');
    $free = function (string $slug) use ($st, $excludeId): bool {
        $st->execute([$slug, $excludeId ?? '']);
        return !$st->fetch();
    };
    $bases = array_values(array_filter(array_map(function ($t) {
        return substr(slugify((string) $t), 0, 180);
    }, (array) $texts)));
    $bases = $bases ?: ['actividad'];
    foreach ($bases as $slug) {
        if ($free($slug)) {
            return $slug;
        }
    }
    for ($n = 2; ; $n++) {
        if ($free($bases[0] . '-' . $n)) {
            return $bases[0] . '-' . $n;
        }
    }
}

/** Slug de una actividad: su nombre; si ya existe otra igual, nombre + día/fecha + hora. */
function activity_slug(string $id, string $title, ?array $session): string
{
    $when = $session ? trim(($session['weekday'] ?: $session['date'] ?: '') . ' ' . str_replace(':', '', substr((string) $session['time_start'], 0, 5))) : '';
    return unique_slug('activities', $when !== '' ? [$title, "$title $when"] : [$title], $id);
}

/**
 * Guarda una actividad y todas sus sesiones de una vez (el formulario del panel es uno solo).
 * Las sesiones que ya no vienen en la lista se borran. El formato (única / serie) se deduce
 * de la cantidad de sesiones. Una actividad nueva y visible avisa a los dispositivos suscritos.
 */
function save_activity(array $input, array $admin): array
{
    $sessionCols = array_values(array_diff(TABLES['sessions']['cols'], ['activity_id']));
    $sessions = [];
    foreach ((array) ($input['sessions'] ?? []) as $raw) {
        $row = [];
        foreach ($sessionCols as $col) {
            $v = $raw[$col] ?? null;
            $row[$col] = ($v === '' || $v === null) ? null : (string) $v;
        }
        if (!$row['date'] && !$row['weekday']) {
            // Fila vacía (ej. la que trae por defecto una actividad nueva): se ignora.
            $filled = array_filter($row, function ($v, $k) {
                return $v !== null && !in_array($k, ['location_id', 'location_text'], true);
            }, ARRAY_FILTER_USE_BOTH);
            if (!$filled) {
                continue;
            }
            throw new ApiError('Cada sesión necesita una fecha o el día en que se repite.', 400);
        }
        if ($row['date']) {
            $row['weekday'] = null;
        }
        $sessions[] = ['id' => (string) ($raw['id'] ?? ''), 'values' => $row];
    }

    $activity = array_intersect_key($input, array_flip(array_merge(['id'], TABLES['activities']['cols'])));
    $activity['format'] = count($sessions) > 1 ? 'series' : 'single';

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $result = save_row('activities', $activity, $admin);
        $keep = [];
        foreach ($sessions as $s) {
            $values = $s['values'];
            if ($s['id'] !== '') {
                $sets = implode(', ', array_map(function ($c) {
                    return q($c) . ' = ?';
                }, array_keys($values)));
                $pdo->prepare("UPDATE sessions SET $sets WHERE id = ? AND activity_id = ?")
                    ->execute(array_merge(array_values($values), [$s['id'], $result['id']]));
                $keep[] = $s['id'];
            } else {
                $sid = uuid();
                $values = ['id' => $sid, 'activity_id' => $result['id']] + $values;
                $pdo->prepare('INSERT INTO sessions (' . implode(', ', array_map('q', array_keys($values))) . ') VALUES ('
                    . implode(', ', array_fill(0, count($values), '?')) . ')')->execute(array_values($values));
                $keep[] = $sid;
            }
        }
        $marks = $keep ? ' AND id NOT IN (' . implode(', ', array_fill(0, count($keep), '?')) . ')' : '';
        $pdo->prepare("DELETE FROM sessions WHERE activity_id = ?$marks")->execute(array_merge([$result['id']], $keep));
        // Con las sesiones ya guardadas, el slug puede usar día y hora si el nombre se repite.
        $result['slug'] = activity_slug($result['id'], (string) ($activity['title'] ?? ''), $sessions[0]['values'] ?? null);
        $pdo->prepare('UPDATE activities SET slug = ? WHERE id = ?')->execute([$result['slug'], $result['id']]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    // Actividad nueva y visible -> notificación a todos los dispositivos suscritos.
    if ($result['created'] && !empty($activity['visible'])) {
        try {
            $result['notified'] = push_send_all(
                ['title' => 'Nueva actividad en Poloniapp', 'body' => (string) ($activity['title'] ?? ''), 'url' => './actividad/' . $result['slug']],
                'mailto:' . $admin['email']
            );
        } catch (Throwable $e) {
            error_log('[poloniapp push] ' . $e); // la actividad ya quedó guardada aunque falle el aviso
        }
    }
    return $result;
}

function delete_row(string $table, array $input): void
{
    $cfg = table_config($table);
    if ($table === 'site_content' || empty($input['id'])) {
        throw new ApiError('No se puede borrar.', 400);
    }
    db()->prepare('DELETE FROM ' . q($table) . ' WHERE id = ?')->execute([$input['id']]);
}

function add_admin(array $in): void
{
    $email = strtolower(trim((string) ($in['email'] ?? '')));
    $password = (string) ($in['password'] ?? '');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 8) {
        throw new ApiError('Email válido y contraseña de al menos 8 caracteres.', 400);
    }
    $st = db()->prepare('SELECT 1 FROM admins WHERE email = ?');
    $st->execute([$email]);
    if ($st->fetch()) {
        throw new ApiError('Ya existe un administrador con ese email.', 400);
    }
    db()->prepare('INSERT INTO admins (id, email, password_hash) VALUES (?, ?, ?)')
        ->execute([uuid(), $email, password_hash($password, PASSWORD_DEFAULT)]);
}

function upload_image(): array
{
    $file = $_FILES['file'] ?? null;
    if (!$file || $file['error'] !== UPLOAD_ERR_OK) {
        throw new ApiError('No llegó la imagen (¿pesa más de lo que permite el servidor?).', 400);
    }
    if ($file['size'] > UPLOAD_MAX_BYTES) {
        throw new ApiError('La imagen pesa más de 10 MB.', 400);
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    if (!isset(UPLOAD_TYPES[$mime])) {
        throw new ApiError('Formato no permitido: usa JPG, PNG, WEBP o GIF.', 400);
    }
    $dir = dirname(__DIR__) . '/uploads';
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
        throw new ApiError('No se pudo crear la carpeta uploads/.', 500);
    }
    $name = bin2hex(random_bytes(16)) . '.' . UPLOAD_TYPES[$mime];
    if (!move_uploaded_file($file['tmp_name'], "$dir/$name")) {
        throw new ApiError('No se pudo guardar la imagen.', 500);
    }
    chmod("$dir/$name", 0644);
    // Ruta relativa a la raíz del sitio, igual que las fotos de assets/.
    return ['url' => "uploads/$name"];
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$isAdminAction = !in_array($action, ['public', 'status', 'prayer', 'push_key', 'push_message', 'subscribe', 'unsubscribe'], true);

try {
    if ($method === 'POST' && ($_SERVER['HTTP_X_POLONIAPP'] ?? '') !== '1') {
        throw new ApiError('Petición no permitida.', 403);
    }
    ensure_schema();

    switch ("$method $action") {
        case 'GET public':
            respond(public_payload());

        case 'GET status':
            $setup = needs_setup();
            $admin = $setup ? null : current_admin();
            respond(['needs_setup' => $setup, 'admin' => $admin ? $admin['email'] : null]);

        case 'GET prayer':
            $prayer = prayer_items();
            foreach ($prayer['items'] as &$item) {
                unset($item['detail'], $item['fetched_at']);
            }
            respond($prayer);

        case 'GET push_key':
            respond(['key' => vapid_keys()[0]]);

        case 'GET push_message':
            respond(push_message());

        case 'POST subscribe':
            push_subscribe(body());
            respond(['ok' => true]);

        case 'POST unsubscribe':
            push_unsubscribe(body());
            respond(['ok' => true]);

        case 'POST setup':
            install();
            migrate();
            if (!needs_setup()) {
                throw new ApiError('Ya existe un administrador.', 403);
            }
            add_admin(body());
            $st = db()->query('SELECT id, email FROM admins');
            $admin = $st->fetch();
            log_in($admin);
            respond(['admin' => $admin['email']]);

        case 'POST login':
            $in = body();
            $st = db()->prepare('SELECT id, email, password_hash FROM admins WHERE email = ?');
            $st->execute([strtolower(trim((string) ($in['email'] ?? '')))]);
            $row = $st->fetch();
            if (!$row || !password_verify((string) ($in['password'] ?? ''), $row['password_hash'])) {
                sleep(1); // frena intentos de fuerza bruta
                throw new ApiError('Email o contraseña incorrectos.', 401);
            }
            log_in($row);
            respond(['admin' => $row['email']]);

        case 'POST logout':
            start_session();
            $_SESSION = [];
            session_destroy();
            respond(['ok' => true]);

        case 'GET list':
            require_admin();
            respond(list_table((string) ($_GET['table'] ?? '')));

        case 'POST save':
            respond(save_row((string) ($_GET['table'] ?? ''), body(), require_admin()));

        case 'POST delete':
            require_admin();
            delete_row((string) ($_GET['table'] ?? ''), body());
            respond(['ok' => true]);

        case 'POST upload':
            require_admin();
            respond(upload_image());

        case 'GET prayer_admin':
            require_admin();
            respond(prayer_items());

        case 'GET stats':
            require_admin();
            respond(push_status());

        case 'POST push_test':
            $admin = require_admin();
            push_send_all(
                ['title' => 'Prueba de Poloniapp', 'body' => 'Si ves esto, las notificaciones funcionan.', 'url' => './'],
                'mailto:' . $admin['email']
            );
            respond(push_status());

        case 'POST prayer_refresh':
            require_admin();
            respond(prayer_items(true));

        case 'POST prayer_override':
            require_admin();
            prayer_override(body());
            respond(prayer_items());

        case 'POST save_activity':
            respond(save_activity(body(), require_admin()));

        case 'POST category_create':
            require_admin();
            respond(create_category(body()));

        case 'POST admin_add':
            require_admin();
            add_admin(body());
            respond(['ok' => true]);

        case 'POST admin_delete':
            $admin = require_admin();
            $id = (string) (body()['id'] ?? '');
            if ($id === $admin['id']) {
                throw new ApiError('No puedes borrar tu propia cuenta.', 400);
            }
            db()->prepare('DELETE FROM admins WHERE id = ?')->execute([$id]);
            respond(['ok' => true]);

        case 'POST password':
            $admin = require_admin();
            $in = body();
            $st = db()->prepare('SELECT password_hash FROM admins WHERE id = ?');
            $st->execute([$admin['id']]);
            if (!password_verify((string) ($in['current'] ?? ''), (string) $st->fetchColumn())) {
                throw new ApiError('La contraseña actual no es correcta.', 400);
            }
            if (strlen((string) ($in['new'] ?? '')) < 8) {
                throw new ApiError('La nueva contraseña debe tener al menos 8 caracteres.', 400);
            }
            db()->prepare('UPDATE admins SET password_hash = ? WHERE id = ?')
                ->execute([password_hash((string) $in['new'], PASSWORD_DEFAULT), $admin['id']]);
            respond(['ok' => true]);

        default:
            throw new ApiError('Acción desconocida.', 404);
    }
} catch (ApiError $e) {
    respond(['error' => $e->getMessage()], $e->getCode() ?: 400);
} catch (PDOException $e) {
    $info = $e->errorInfo[1] ?? 0;
    if ($info === 1451) {
        respond(['error' => 'No se puede borrar: hay otros datos que dependen de esto (ej. actividades de esta categoría).'], 409);
    } elseif ($info === 1062) {
        respond(['error' => 'Ya existe otro registro con ese mismo valor (ej. el mismo nombre o la misma fecha).'], 409);
    } elseif (in_array($info, [3819, 4025], true)) {
        respond(['error' => 'Datos inválidos: revisa los campos obligatorios (ej. una sesión necesita fecha o día recurrente).'], 400);
    }
    error_log('[poloniapp api] ' . $e);
    respond(['error' => $isAdminAction ? $e->getMessage() : 'Error interno del servidor.'], 500);
} catch (Throwable $e) {
    error_log('[poloniapp api] ' . $e);
    // Al público no se le muestran detalles internos; al admin sí, para poder diagnosticar.
    respond(['error' => $isAdminAction ? $e->getMessage() : 'Error interno del servidor.'], 500);
}
