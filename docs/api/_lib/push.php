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

function b64url_decode(string $s): string
{
    return (string) base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4));
}

/**
 * Cifra el mensaje para un dispositivo (RFC 8291, "aes128gcm"). Algunos servicios (Apple)
 * esperan contenido en el aviso; si algo falla se manda vacío y el service worker lo pide a la API.
 */
function push_encrypt(string $payload, string $p256dh, string $auth): ?string
{
    $uaPublic = b64url_decode($p256dh);
    $authSecret = b64url_decode($auth);
    if (strlen($uaPublic) !== 65 || strlen($authSecret) < 16 || !function_exists('openssl_pkey_derive')) {
        return null;
    }
    // Clave efímera del servidor para este mensaje
    $local = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
    if (!$local) {
        return null;
    }
    $ec = openssl_pkey_get_details($local)['ec'];
    $asPublic = "\x04" . str_pad($ec['x'], 32, "\0", STR_PAD_LEFT) . str_pad($ec['y'], 32, "\0", STR_PAD_LEFT);
    // Clave pública del navegador (punto P-256 sin comprimir) -> PEM para OpenSSL
    $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $uaPublic;
    $uaPem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
    $shared = openssl_pkey_derive(openssl_pkey_get_public($uaPem), $local, 32);
    if ($shared === false) {
        return null;
    }
    $ikm = hash_hkdf('sha256', $shared, 32, "WebPush: info\0" . $uaPublic . $asPublic, $authSecret);
    $salt = random_bytes(16);
    $cek = hash_hkdf('sha256', $ikm, 16, "Content-Encoding: aes128gcm\0", $salt);
    $nonce = hash_hkdf('sha256', $ikm, 12, "Content-Encoding: nonce\0", $salt);
    $cipher = openssl_encrypt($payload . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag);
    if ($cipher === false) {
        return null;
    }
    return $salt . pack('N', 4096) . chr(65) . $asPublic . $cipher . $tag;
}

function push_service(string $endpoint): string
{
    $host = (string) parse_url($endpoint, PHP_URL_HOST);
    if (strpos($host, 'apple.com') !== false) {
        return 'iPhone / Mac (Apple)';
    }
    if (strpos($host, 'googleapis.com') !== false) {
        return 'Android / Chrome (Google)';
    }
    if (strpos($host, 'mozilla.com') !== false) {
        return 'Firefox';
    }
    return strpos($host, 'windows.com') !== false ? 'Edge (Windows)' : $host;
}

/** Dispositivos suscritos por servicio + resultado del último envío (para el panel). */
function push_status(): array
{
    $byService = [];
    foreach (db()->query('SELECT endpoint FROM push_subscriptions') as $row) {
        $service = push_service($row['endpoint']);
        $byService[$service] = ($byService[$service] ?? 0) + 1;
    }
    return [
        'subscribers' => array_sum($byService),
        'by_service' => $byService,
        'last_report' => json_decode((string) setting('last_push_report'), true),
    ];
}

/** Guarda el mensaje y avisa a todos los dispositivos suscritos. Devuelve cuántos lo recibieron. */
function push_send_all(array $message, string $subject): int
{
    $message += ['ts' => time()];
    $json = json_encode($message, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    set_setting('last_push', $json);
    $subs = db()->query('SELECT id, endpoint, p256dh, auth FROM push_subscriptions')->fetchAll();
    $report = ['at' => date('Y-m-d H:i:s'), 'title' => $message['body'] ?? '', 'total' => count($subs), 'sent' => 0, 'removed' => 0, 'errors' => []];
    if (!$subs || !function_exists('curl_multi_init')) {
        if ($subs) {
            $report['errors'][] = ['service' => 'servidor', 'code' => 0, 'detail' => 'PHP sin la extensión curl'];
        }
        set_setting('last_push_report', json_encode($report, JSON_UNESCAPED_UNICODE));
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
        $body = $sub['p256dh'] && $sub['auth'] ? push_encrypt($json, $sub['p256dh'], $sub['auth']) : null;
        $headers = ['Authorization: vapid t=' . $jwts[$audience] . ', k=' . $public, 'TTL: 86400', 'Urgency: high'];
        if ($body !== null) {
            $headers[] = 'Content-Encoding: aes128gcm';
            $headers[] = 'Content-Type: application/octet-stream';
        }
        $headers[] = 'Content-Length: ' . strlen((string) $body);
        $ch = curl_init($sub['endpoint']);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => (string) $body,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_HTTPHEADER => $headers,
        ]);
        curl_multi_add_handle($mh, $ch);
        $handles[$sub['id']] = [$ch, $sub['endpoint']];
    }
    do {
        $status = curl_multi_exec($mh, $running);
        if ($running) {
            curl_multi_select($mh, 1.0);
        }
    } while ($running && $status === CURLM_OK);

    $gone = db()->prepare('DELETE FROM push_subscriptions WHERE id = ?');
    foreach ($handles as $id => [$ch, $endpoint]) {
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        if ($code >= 200 && $code < 300) {
            $report['sent']++;
        } elseif ($code === 404 || $code === 410) {
            $gone->execute([$id]); // el dispositivo se dio de baja o desinstaló la app
            $report['removed']++;
        } else {
            $detail = $code ? substr(trim((string) curl_multi_getcontent($ch)), 0, 200) : curl_error($ch);
            $report['errors'][] = ['service' => push_service($endpoint), 'code' => $code, 'detail' => $detail];
            error_log("[poloniapp push] HTTP $code $detail");
        }
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
    }
    curl_multi_close($mh);
    set_setting('last_push_report', json_encode($report, JSON_UNESCAPED_UNICODE));
    return $report['sent'];
}
