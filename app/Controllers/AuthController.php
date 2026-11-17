<?php
declare(strict_types=1);

final class AuthController {
    public static function bootstrap(): never {
        $user = AuthService::user();
        Response::json([
            'csrf' => $_SESSION['csrf'],
            'authenticated' => (bool)$user,
            'user' => $user,
            'accounts' => $user ? (in_array($user['role'], ['Super Admin','Admin'], true) ? User::all() : [$user]) : [],
            'contents' => $user ? Content::all() : [],
        ]);
    }

    public static function login(): never {
        $input = Response::input();
        $account = User::findByUsername((string)($input['username'] ?? ''));
        if (!$account || !password_verify((string)($input['password'] ?? ''), $account['password_hash'])) {
            Response::json(['message' => 'Username atau password salah.'], 422);
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

    public static function logout(): never {
        unset($_SESSION['user']);
        session_regenerate_id(true);
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        Response::json(['ok' => true, 'csrf' => $_SESSION['csrf']]);
    }
}
