<?php
// poloniapp — entrega la página (index.html) para las direcciones limpias del sitio
// (/actividad/…, /actividades/…, /quienes-somos/…; ver .htaccess) con título, descripción e
// imagen propias de esa actividad, categoría o proyecto. Así WhatsApp, Google, etc. muestran
// la vista previa correcta al compartir un link. Si la base no responde, entrega la página
// con los datos generales: el sitio igual funciona porque el contenido lo arma app.js.

declare(strict_types=1);

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');

const DEFAULT_TITLE = 'Poloniapp — Centro Cultural Opus Dei, Las Condes';
const DEFAULT_DESCRIPTION = 'Actividades, formación y oración del centro cultural Polonia, Las Condes.';

$path = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$parts = array_values(array_filter(array_map('rawurldecode', explode('/', $path)), 'strlen'));
$site = 'https://' . preg_replace('/[^a-z0-9.\-:]/i', '', $_SERVER['HTTP_HOST'] ?? 'poloniapp.cl');

$meta = ['title' => DEFAULT_TITLE, 'description' => DEFAULT_DESCRIPTION, 'image' => 'assets/img/og-default.png', 'found' => true];

function plain(string $text, int $max = 200): string
{
    $text = trim(preg_replace('/\s+/u', ' ', str_replace('**', '', $text)));
    if (function_exists('mb_strlen') && mb_strlen($text) > $max) {
        return rtrim(mb_substr($text, 0, $max - 1)) . '…';
    }
    return $text;
}

try {
    $c = require __DIR__ . '/api/config.php';
    $pdo = new PDO(
        sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $c['db_host'] ?? 'localhost', $c['db_name']),
        $c['db_user'],
        $c['db_pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
    $one = function (string $sql, array $args) use ($pdo) {
        $st = $pdo->prepare($sql);
        $st->execute($args);
        return $st->fetch() ?: null;
    };

    if (($parts[0] ?? '') === 'actividad' && isset($parts[1])) {
        $a = $one(
            'SELECT a.title, a.description, a.photo_url, c.name AS category, c.slug AS category_slug
             FROM activities a LEFT JOIN categories c ON c.id = a.category_id
             WHERE (a.slug = ? OR a.id = ?) AND a.visible = 1',
            [$parts[1], $parts[1]]
        );
        if ($a) {
            $meta['title'] = $a['title'] . ' — Poloniapp';
            $meta['description'] = plain($a['description'] ?: ($a['category'] ? $a['category'] . ' en el centro cultural Polonia, Las Condes.' : DEFAULT_DESCRIPTION));
            if ($a['photo_url'] && $a['category_slug'] !== 'circulos') {
                $meta['image'] = $a['photo_url'];
            }
        } else {
            $meta['found'] = false;
        }
    } elseif (($parts[0] ?? '') === 'actividades' && isset($parts[1])) {
        $cat = $one('SELECT name, description FROM categories WHERE slug = ? AND visible = 1', [$parts[1]]);
        if ($cat) {
            $meta['title'] = $cat['name'] . ' — Poloniapp';
            $meta['description'] = plain($cat['description'] ?: $cat['name'] . ' en el centro cultural Polonia, Las Condes.');
        } else {
            $meta['found'] = false;
        }
    } elseif (($parts[0] ?? '') === 'actividades') {
        $meta['title'] = 'Actividades — Poloniapp';
    } elseif (($parts[0] ?? '') === 'quienes-somos' && ($parts[1] ?? '') === 'proyectos' && isset($parts[2])) {
        $p = $one('SELECT title, tagline, summary, logo_url FROM projects WHERE slug = ? AND visible = 1', [$parts[2]]);
        if ($p) {
            $meta['title'] = $p['title'] . ($p['tagline'] ? ' · ' . $p['tagline'] : '') . ' — Poloniapp';
            $meta['description'] = plain($p['summary'] ?: DEFAULT_DESCRIPTION);
            if ($p['logo_url']) {
                $meta['image'] = $p['logo_url'];
            }
        } else {
            $meta['found'] = false;
        }
    } elseif (($parts[0] ?? '') === 'quienes-somos') {
        $teaser = $one("SELECT value FROM site_content WHERE `key` = 'quienes_somos.teaser'", []);
        $meta['title'] = 'Quiénes somos — Poloniapp';
        $meta['description'] = plain($teaser['value'] ?? DEFAULT_DESCRIPTION);
    }
} catch (Throwable $e) {
    error_log('[poloniapp page] ' . $e->getMessage()); // vista previa general; la página igual funciona
}

$image = preg_match('#^https?://#i', $meta['image']) ? $meta['image'] : $site . '/' . ltrim($meta['image'], '/');
$h = function (string $s): string {
    return htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
};
$tags = '<title>' . $h($meta['title']) . "</title>\n"
    . '  <meta name="description" content="' . $h($meta['description']) . "\">\n"
    . "  <meta property=\"og:type\" content=\"website\">\n"
    . "  <meta property=\"og:site_name\" content=\"Poloniapp\">\n"
    . '  <meta property="og:title" content="' . $h($meta['title']) . "\">\n"
    . '  <meta property="og:description" content="' . $h($meta['description']) . "\">\n"
    . '  <meta property="og:image" content="' . $h($image) . "\">\n"
    . '  <meta property="og:url" content="' . $h($site . $path) . "\">\n"
    . "  <meta name=\"twitter:card\" content=\"summary_large_image\">";

$html = (string) file_get_contents(__DIR__ . '/index.html');
// Callback (no string de reemplazo): un "$10.000" en una descripción se copia tal cual.
$html = preg_replace_callback('#<!-- meta:start.*?-->.*?<!-- meta:end -->#s', function () use ($tags) {
    return $tags;
}, $html, 1);
if (!$meta['found']) {
    http_response_code(404); // la página igual se muestra ("no encontrada"), pero Google no la indexa
}
echo $html;
