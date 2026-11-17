<?php
declare(strict_types=1);

final class ProfileController {
    public static function save(): never {
        $actor = AuthService::requireUser();
        $input = Response::input();
        $name = trim((string)($input['name'] ?? ''));
        $username = strtolower(trim((string)($input['username'] ?? '')));
        $password = (string)($input['password'] ?? '');
        if ($name === '' || $username === '') Response::json(['message' => 'Nama dan username wajib diisi.'], 422);
        $existing = User::findByUsername($username);
        if ($existing && (int)$existing['id'] !== (int)$actor['id']) Response::json(['message' => 'Username sudah digunakan.'], 422);
        User::updateProfile((int)$actor['id'], $name, $username, $password !== '' ? $password : null);
        $fresh = User::find((int)$actor['id']);
        $_SESSION['user'] = AuthService::publicUser($fresh);
        Response::json(['user' => $_SESSION['user']]);
    }
}
