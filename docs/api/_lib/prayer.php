<?php
// poloniapp — "Para rezar hoy": título del día del Evangelio, la meditación y el texto diario
// de opusdei.org. El servidor lee cada página una vez al día (identificándose como Poloniapp,
// sin intentar saltarse protecciones anti-bots) y guarda el resultado en prayer_items.
// Si opusdei.org no permite la lectura, se muestra un título con la fecha y el mismo link,
// y se vuelve a intentar cada 3 horas. Un admin puede escribir los títulos del día a mano.

declare(strict_types=1);

const PRAYER_SOURCES = [
    'gospel' => 'https://opusdei.org/es-cl/gospel/',
    'meditation' => 'https://opusdei.org/es-cl/meditation/',
    'dailytext' => 'https://opusdei.org/es-cl/dailytext/',
];
const PRAYER_RETRY_SECONDS = 3 * 3600;
const PRAYER_USER_AGENT = 'Mozilla/5.0 (compatible; PoloniappBot/1.0; +https://poloniapp.cl)';

const DAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function prayer_fallback_title(string $kind, string $day): string
{
    $ts = strtotime($day);
    $date = DAYS_ES[(int) date('w', $ts)] . ' ' . date('j', $ts) . ' de ' . MONTHS_ES[(int) date('n', $ts) - 1];
    switch ($kind) {
        case 'gospel':
            return "Evangelio del $date";
        case 'meditation':
            return "Meditación del $date";
        default:
            return 'Un texto para meditar hoy';
    }
}

/**
 * Devuelve los 3 ítems de hoy. Lee opusdei.org solo si falta alguno, si el último intento
 * falló hace más de 3 horas, o si $force (botón del panel). Los títulos manuales no se pisan.
 */
function prayer_items(bool $force = false): array
{
    $day = date('Y-m-d');
    $rows = prayer_rows($day);

    $pending = [];
    foreach (array_keys(PRAYER_SOURCES) as $kind) {
        $row = $rows[$kind] ?? null;
        if (!$row
            || ($force && $row['source'] !== 'manual')
            || ($row['source'] === 'fallback' && strtotime($row['fetched_at']) < time() - PRAYER_RETRY_SECONDS)) {
            $pending[] = $kind;
        }
    }

    // Si otra visita ya está consultando opusdei.org, no se repite: se responde con lo que haya.
    if ($pending && (int) db()->query("SELECT GET_LOCK('poloniapp_prayer', 0)")->fetchColumn() === 1) {
        try {
            $results = prayer_fetch($pending);
            $now = date('Y-m-d H:i:s');
            $st = db()->prepare(
                'INSERT INTO prayer_items (day, kind, title, source, detail, fetched_at) VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE title = VALUES(title), source = VALUES(source), detail = VALUES(detail), fetched_at = VALUES(fetched_at)'
            );
            foreach ($pending as $kind) {
                $title = $results[$kind]['title'];
                $st->execute([
                    $day,
                    $kind,
                    $title ?? prayer_fallback_title($kind, $day),
                    $title ? 'auto' : 'fallback',
                    $title ? 'Leído de opusdei.org' : $results[$kind]['error'],
                    $now,
                ]);
            }
        } finally {
            db()->query("SELECT RELEASE_LOCK('poloniapp_prayer')");
        }
        $rows = prayer_rows($day);
    }

    $items = [];
    foreach (PRAYER_SOURCES as $kind => $url) {
        $row = $rows[$kind] ?? null;
        $items[] = [
            'kind' => $kind,
            'title' => $row ? $row['title'] : prayer_fallback_title($kind, $day),
            'url' => $url,
            'source' => $row ? $row['source'] : 'fallback',
            'detail' => $row ? $row['detail'] : null,
            'fetched_at' => $row ? $row['fetched_at'] : null,
        ];
    }
    return ['date' => $day, 'items' => $items];
}

function prayer_rows(string $day): array
{
    $st = db()->prepare('SELECT * FROM prayer_items WHERE day = ?');
    $st->execute([$day]);
    $rows = [];
    foreach ($st as $row) {
        $rows[$row['kind']] = $row;
    }
    return $rows;
}

/** Títulos escritos a mano para hoy. Un campo vacío borra el manual y vuelve a lo automático. */
function prayer_override(array $input): void
{
    $day = date('Y-m-d');
    foreach (array_keys(PRAYER_SOURCES) as $kind) {
        if (!array_key_exists($kind, $input)) {
            continue;
        }
        $title = trim((string) $input[$kind]);
        if ($title === '') {
            db()->prepare("DELETE FROM prayer_items WHERE day = ? AND kind = ? AND source = 'manual'")->execute([$day, $kind]);
            continue;
        }
        db()->prepare(
            "INSERT INTO prayer_items (day, kind, title, source, detail, fetched_at) VALUES (?, ?, ?, 'manual', 'Escrito en el panel', ?)
             ON DUPLICATE KEY UPDATE title = VALUES(title), source = 'manual', detail = VALUES(detail), fetched_at = VALUES(fetched_at)"
        )->execute([$day, $kind, mb_substr_safe($title, 500), date('Y-m-d H:i:s')]);
    }
}

function mb_substr_safe(string $s, int $max): string
{
    return function_exists('mb_substr') ? mb_substr($s, 0, $max) : substr($s, 0, $max);
}

/** Pide las páginas en paralelo (máx. ~8 s en total). */
function prayer_fetch(array $kinds): array
{
    $out = [];
    if (!function_exists('curl_multi_init')) {
        foreach ($kinds as $kind) {
            $out[$kind] = ['title' => null, 'error' => 'El servidor no tiene la extensión curl de PHP'];
        }
        return $out;
    }
    $mh = curl_multi_init();
    $handles = [];
    foreach ($kinds as $kind) {
        $ch = curl_init(PRAYER_SOURCES[$kind]);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_USERAGENT => PRAYER_USER_AGENT,
            CURLOPT_HTTPHEADER => ['Accept: text/html', 'Accept-Language: es-CL,es;q=0.9'],
            CURLOPT_ENCODING => '',
            CURLOPT_HEADER => true,
        ]);
        curl_multi_add_handle($mh, $ch);
        $handles[$kind] = $ch;
    }
    do {
        $status = curl_multi_exec($mh, $running);
        if ($running) {
            curl_multi_select($mh, 1.0);
        }
    } while ($running && $status === CURLM_OK);

    foreach ($handles as $kind => $ch) {
        $response = (string) curl_multi_getcontent($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $error = curl_error($ch);
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);

        $headers = substr($response, 0, $headerSize);
        $html = substr($response, $headerSize);
        if ($code === 0) {
            $out[$kind] = ['title' => null, 'error' => 'Sin respuesta de opusdei.org' . ($error ? " ($error)" : '')];
        } elseif (stripos($headers, 'cf-mitigated') !== false || strpos($html, '/cdn-cgi/challenge-platform') !== false) {
            $out[$kind] = ['title' => null, 'error' => "opusdei.org bloqueó la lectura automática (protección anti-bots, HTTP $code)"];
        } elseif ($code !== 200) {
            $out[$kind] = ['title' => null, 'error' => "opusdei.org respondió HTTP $code"];
        } else {
            $title = extract_prayer_title($html, $kind);
            $out[$kind] = $title
                ? ['title' => $title, 'error' => null]
                : ['title' => null, 'error' => 'No se encontró el título del día en la página'];
        }
    }
    curl_multi_close($mh);
    return $out;
}

/**
 * Busca el título del día en el HTML: og:title, luego enlaces a la sección
 * (/es-cl/gospel/<algo>), luego h1/h2 y <title>. Descarta títulos genéricos de la sección.
 */
function extract_prayer_title(string $html, string $kind): ?string
{
    $candidates = [];
    if (preg_match('/<meta[^>]+(?:property|name)=["\']og:title["\'][^>]*>/i', $html, $m)
        && preg_match('/content=["\']([^"\']*)["\']/i', $m[0], $c)) {
        $candidates[] = $c[1];
    }
    if (preg_match_all('#<a[^>]+href=["\'][^"\']*/' . preg_quote($kind, '#') . '/[a-z0-9][^"\'?\#]*["\'][^>]*>(.*?)</a>#is', $html, $m)) {
        array_push($candidates, ...$m[1]);
    }
    foreach (['h1', 'h2'] as $tag) {
        if (preg_match_all("#<$tag\b[^>]*>(.*?)</$tag>#is", $html, $m)) {
            array_push($candidates, ...$m[1]);
        }
    }
    if (preg_match('#<title[^>]*>(.*?)</title>#is', $html, $m)) {
        $candidates[] = $m[1];
    }

    foreach ($candidates as $raw) {
        $text = clean_title($raw);
        $len = function_exists('mb_strlen') ? mb_strlen($text) : strlen($text);
        if ($len >= 8 && $len <= 200 && !is_generic_title($text)) {
            return $text;
        }
    }
    return null;
}

function clean_title(string $raw): string
{
    $text = html_entity_decode(strip_tags($raw), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = trim(preg_replace('/\s+/u', ' ', $text));
    return trim(preg_replace('/\s*[-|–—]\s*Opus Dei\s*$/iu', '', $text));
}

function is_generic_title(string $text): bool
{
    return (bool) preg_match(
        '/^(opus dei|evangelio( del d[ií]a| de hoy)?|meditaci[oó]n(es)?( del d[ií]a| de hoy| diarias?)?|textos? (diarios?|del d[ií]a|de hoy)|saltar al contenido( principal)?|men[uú]|buscar|inicio)$/iu',
        $text
    );
}
