<?php
declare(strict_types=1);

final class AuthService {
    public static function bootSession(): void {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_name('hch_session');
            session_set_cookie_params([
                'lifetime' => 0,
                'path' => '/',
                'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
                'httponly' => true,
                'samesite' => 'Lax',
            ]);
            session_start();
        }
        if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }

    public static function checkCsrf(): void {
        $provided = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!hash_equals((string)($_SESSION['csrf'] ?? ''), (string)$provided)) {
            Response::json(['message' => 'Sesi keamanan kedaluwarsa. Muat ulang halaman lalu coba lagi.'], 419);
        }
    }

    public static function user(): ?array {
        return $_SESSION['user'] ?? null;
    }

    public static function requireUser(): array {
        $user = self::user();
        if (!$user) Response::json(['message' => 'Sesi login berakhir. Silakan masuk kembali.'], 401);
        return $user;
    }

    public static function requireAdmin(): array {
        $user = self::requireUser();
        if (!in_array($user['role'], ['Super Admin', 'Admin'], true)) {
            Response::json(['message' => 'Akses ditolak. Fitur ini hanya untuk Admin.'], 403);
        }
        return $user;
    }

    public static function publicUser(array $user): array {
        return [
            'id' => (int)$user['id'],
            'name' => $user['name'],
            'username' => $user['username'],
            'role' => $user['role'],
            'avatar' => $user['avatar'] ?? null,
        ];
    }
}
