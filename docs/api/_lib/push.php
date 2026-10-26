<?php
// poloniapp — notificaciones push (Web Push con VAPID), sin librerías externas.
//
// Se envían sin contenido cifrado ("push vacío"): el service worker, al recibir el aviso,
// pide el mensaje a la API (?action=push_message) y lo muestra. Así no hace falta cifrar
// cada mensaje por dispositivo, solo firmar un JWT (ES256) con la clave VAPID del servidor.
// Las claves VAPID se generan solas la primera vez y quedan guardadas en la tabla settings.

declare(strict_types=1);

// Solo se aceptan suscripciones de los servicios push de los navegadores (evita que alguien
// registre una URL cualquiera para que el servidor le haga requests).
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'push.services.mozilla.com', 'web.push.apple.com', 'notify.windows.com'];

function b64url_encode(string $s): string
{
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

/** [clave pública base64url (para el navegador), clave privada PEM] */
function vapid_keys(): array
{
    $stored = setting('vapid');
    if (!$stored) {
        $key = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
        if (!$key || !openssl_pkey_export($key, $pem)) {
            throw new ApiError('El servidor no pudo generar las claves para notificaciones (OpenSSL).', 500);
        }
        $ec = openssl_pkey_get_details($key)['ec'];
        $public = "\x04" . str_pad($ec['x'], 32, "\0", STR_PAD_LEFT) . str_pad($ec['y'], 32, "\0", STR_PAD_LEFT);
        // INSERT IGNORE: si dos requests generan claves a la vez, gana la primera y ambos la releen.
        db()->prepare('INSERT IGNORE INTO settings (name, value) VALUES (?, ?)')
            ->execute(['vapid', json_encode(['public' => b64url_encode($public), 'private' => $pem])]);
        $stored = setting('vapid');
    }
    $keys = json_decode((string) $stored, true);
    return [$keys['public'], $keys['private']];
}

function vapid_jwt(string $audience, string $privatePem, string $subject): string
{
    $input = b64url_encode(json_encode(['typ' => 'JWT', 'alg' => 'ES256']))
        . '.' . b64url_encode(json_encode(['aud' => $audience, 'exp' => time() + 3600, 'sub' => $subject]));
    if (!openssl_sign($input, $der, $privatePem, OPENSSL_ALGO_SHA256)) {
        throw new ApiError('No se pudo firmar la notificación.', 500);
    }
    return $input . '.' . b64url_encode(ecdsa_der_to_raw($der));
}

/** OpenSSL firma en DER (SEQUENCE de 2 INTEGER); JWT necesita r||s de 32 bytes cada uno. */
function ecdsa_der_to_raw(string $der): string
{
    $pos = 2 + ((ord($der[1]) & 0x80) ? (ord($der[1]) & 0x7f) : 0);
    $parts = [];
    for ($i = 0; $i < 2; $i++) {
        $len = ord($der[$pos + 1]);
        $int = ltrim(substr($der, $pos + 2, $len), "\0");
        $parts[] = str_pad($int, 32, "\0", STR_PAD_LEFT);
        $pos += 2 + $len;
    }
    return $parts[0] . $parts[1];
}

function push_subscribe(array $input): void
{
    $endpoint = (string) ($input['endpoint'] ?? '');
    $host = strtolower((string) parse_url($endpoint, PHP_URL_HOST));
    $allowed = false;
    foreach (PUSH_HOSTS as $suffix) {
        if ($host === $suffix || substr($host, -strlen('.' . $suffix)) === '.' . $suffix) {
            $allowed = true;
        }
    }
    if (strpos($endpoint, 'https://') !== 0 || strlen($endpoint) > 1000 || !$allowed) {
        throw new ApiError('Suscripción no válida.', 400);
    }
    db()->prepare(
        'INSERT INTO push_subscriptions (id, endpoint_hash, endpoint, p256dh, auth) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE p256dh = VALUES(p256dh), auth = VALUES(auth)'
    )->execute([
        uuid(),
        hash('sha256', $endpoint),
        $endpoint,
        substr((string) ($input['keys']['p256dh'] ?? ''), 0, 255),
        substr((string) ($input['keys']['auth'] ?? ''), 0, 255),
    ]);
}

function push_unsubscribe(array $input): void
{
    db()->prepare('DELETE FROM push_subscriptions WHERE endpoint_hash = ?')
        ->execute([hash('sha256', (string) ($input['endpoint'] ?? ''))]);
}

function push_message(): array
{
    $msg = json_decode((string) setting('last_push'), true);
    return is_array($msg) ? $msg : ['title' => 'Poloniapp', 'body' => 'Hay novedades en Poloniapp.', 'url' => './'];
}

/** Guarda el mensaje y avisa a todos los dispositivos suscritos. Devuelve cuántos lo recibieron. */
function push_send_all(array $message, string $subject): int
{
    set_setting('last_push', json_encode($message + ['ts' => time()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    $subs = db()->query('SELECT id, endpoint FROM push_subscriptions')->fetchAll();
    if (!$subs || !function_exists('curl_multi_init')) {
        return 0;
    }
    [$public, $private] = vapid_keys();

    $mh = curl_multi_init();
    $handles = [];
    $jwts = [];
    foreach ($subs as $sub) {
        $parts = parse_url($sub['endpoint']);
        $audience = $parts['scheme'] . '://' . $parts['host'];
        $jwts[$audience] = $jwts[$audience] ?? vapid_jwt($audience, $private, $subject);
        $ch = curl_init($sub['endpoint']);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => '',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_HTTPHEADER => [
                'Authorization: vapid t=' . $jwts[$audience] . ', k=' . $public,
                'TTL: 86400',
                'Urgency: normal',
                'Content-Length: 0',
            ],
        ]);
        curl_multi_add_handle($mh, $ch);
        $handles[$sub['id']] = $ch;
    }
    do {
        $status = curl_multi_exec($mh, $running);
        if ($running) {
            curl_multi_select($mh, 1.0);
        }
    } while ($running && $status === CURLM_OK);

    $sent = 0;
    $gone = db()->prepare('DELETE FROM push_subscriptions WHERE id = ?');
    foreach ($handles as $id => $ch) {
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        if ($code >= 200 && $code < 300) {
            $sent++;
        } elseif ($code === 404 || $code === 410) {
            $gone->execute([$id]); // el dispositivo se dio de baja o desinstaló la app
        } else {
            error_log("[poloniapp push] HTTP $code " . substr((string) curl_multi_getcontent($ch), 0, 200));
        }
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
    }
    curl_multi_close($mh);
    return $sent;
}
