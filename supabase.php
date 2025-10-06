<?php
// supabase.php — κοινή σύνδεση / helpers για Supabase REST

// ===== Στοιχεία σύνδεσης (βάλε εδώ τα δικά σου) =====
$SB_URL = "https://wjsapjgmuplhpjzhilin.supabase.co";
$SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqc2FwamdtdXBsaHBqemhpbGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0NDY1MTUsImV4cCI6MjA3MTAyMjUxNX0.7gJFVRoGfCrVVwyIAB_GWf_Xy85wBT4behIm73zQoZY";

// ===== Helpers =====
function build_query($params) {
    $parts = [];
    foreach ($params as $k => $v) {
        if (is_array($v)) {
            foreach ($v as $vv) {
                $parts[] = rawurlencode($k) . '=' . rawurlencode($vv);
            }
        } elseif ($v !== null) {
            $parts[] = rawurlencode($k) . '=' . rawurlencode($v);
        }
    }
    return implode('&', $parts);
}

/**
 * Κάνει request στο Supabase REST
 * @param string $method (GET, POST, PATCH, DELETE)
 * @param string $path π.χ. "/members"
 * @param array $q query params
 * @param array|null $body JSON body
 * @param array $prefer extra headers (π.χ. ["return=representation"])
 * @return array αποκωδικοποιημένο JSON
 */
function sbreq($method, $path, $q = [], $body = null, $prefer = []) {
    global $SB_URL, $SB_KEY;

    $url = rtrim($SB_URL, '/') . '/rest/v1' . $path;
    if (!empty($q)) {
        $url .= '?' . build_query($q);
    }

    $ch = curl_init($url);
    $headers = [
        'apikey: ' . $SB_KEY,
        'Authorization: Bearer ' . $SB_KEY,
        'Content-Type: application/json',
        'Accept: application/json'
    ];
    if (!empty($prefer)) $headers[] = 'Prefer: ' . implode(',', $prefer);

    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST   => $method,
        CURLOPT_HTTPHEADER      => $headers,
        CURLOPT_RETURNTRANSFER  => true,
        CURLOPT_CONNECTTIMEOUT  => 6,
        CURLOPT_TIMEOUT         => 12,
        CURLOPT_FOLLOWLOCATION  => true,
        CURLOPT_USERAGENT       => 'php-client/1.0'
    ]);
    if (!is_null($body)) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }

    $resp  = curl_exec($ch);
    $code  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err   = curl_error($ch);
    curl_close($ch);

    if ($resp === false) {
        throw new Exception("Curl error: $err");
    }
    $data = json_decode($resp, true);
    if ($code < 200 || $code >= 300) {
        $msg = is_array($data) && isset($data['message']) ? $data['message'] : 'Supabase error';
        throw new Exception($msg);
    }
    return $data;
}
?>
