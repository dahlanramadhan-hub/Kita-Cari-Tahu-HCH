<?php
declare(strict_types=1);

final class Response {
    public static function json(array $data, int $status = 200): never {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function input(): array {
        $raw = file_get_contents('php://input') ?: '';
        $data = json_decode($raw, true);
        if (!is_array($data)) self::json(['message' => 'Format data tidak valid.'], 400);
        return $data;
    }

    public static function fail(Throwable $e): never {
        error_log((string)$e);
        $message = APP_DEBUG ? $e->getMessage() : 'Terjadi kesalahan pada server. Periksa konfigurasi atau log aplikasi.';
        self::json(['message' => $message], 500);
    }
}
