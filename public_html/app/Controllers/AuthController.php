<?php
declare(strict_types=1);

final class AuthController {
    public static function bootstrap() {
        $user = AuthService::user();
        Response::json([
            'csrf' => $_SESSION['csrf'],
            'authenticated' => (bool)$user,
            'user' => $user,
            'accounts' => $user ? (in_array($user['role'], ['Super Admin','Admin'], true) ? User::all() : [$user]) : [],
            'contents' => $user ? Content::all() : [],
        ]);
    }

    public static function login() {
                $input = Response::input();
        $account = User::findByUsername((string)($input['username'] ?? ''));
        $password = (string)($input['password'] ?? '');
        if (!$account || !password_verify($password, $account['password_hash'])) {
            Response::json(['message' => 'Username atau password salah.'], 422);
        }
        if (PasswordVault::decrypt($account['password_enc'] ?? null) !== $password) {
            User::storeEncryptedPassword((int)$account['id'], $password);
        }
        session_regenerate_id(true);
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        $_SESSION['user'] = AuthService::publicUser($account);
        Response::json([
            'user' => $_SESSION['user'],
            'accounts' => in_array($account['role'], ['Super Admin','Admin'], true) ? User::all() : [$_SESSION['user']],
            'contents' => Content::all(),
            'csrf' => $_SESSION['csrf'],
        ]);
    }

    public static function logout() {
        unset($_SESSION['user']);
        session_regenerate_id(true);
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        Response::json(['ok' => true, 'csrf' => $_SESSION['csrf']]);
    }
}
