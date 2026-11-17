<?php
declare(strict_types=1);

final class User {
    /** Menambah kolom password_enc otomatis jika database lama belum punya. */
    public static function ensureSchema(): void {
        if (!empty($_SESSION['schema_ok'])) return;
        $has = db()->query("SHOW COLUMNS FROM users LIKE 'password_enc'")->fetch();
        if (!$has) db()->exec('ALTER TABLE users ADD COLUMN password_enc VARCHAR(512) NULL AFTER password_hash');
        $_SESSION['schema_ok'] = true;
    }

    public static function seedDefaults(): void {
        $count = (int)db()->query('SELECT COUNT(*) FROM users')->fetchColumn();
        if ($count > 0) return;
        $stmt = db()->prepare('INSERT INTO users (name, username, password_hash, password_enc, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())');
        $defaults = [
            ['Super Admin Humas', 'superadmin', 'Super123!', 'Super Admin'],
            ['Admin Humas', 'admin', 'Admin123!', 'Admin'],
            ['Editor Humas', 'editor', 'Editor123!', 'Editor'],
        ];
        foreach ($defaults as [$name, $username, $password, $role]) {
            $stmt->execute([$name, $username, password_hash($password, PASSWORD_DEFAULT), PasswordVault::encrypt($password), $role]);
        }
    }

    public static function findByUsername(string $username): ?array {
        $stmt = db()->prepare('SELECT * FROM users WHERE username = ? LIMIT 1');
        $stmt->execute([strtolower(trim($username))]);
        return $stmt->fetch() ?: null;
    }

    public static function find(int $id): ?array {
        $stmt = db()->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public static function all(): array {
        $rows = db()->query('SELECT id,name,username,role,avatar FROM users ORDER BY id')->fetchAll();
        return array_map([AuthService::class, 'publicUser'], $rows);
    }

    public static function updateProfile(int $id, string $name, string $username, ?string $password = null): void {
        $sql = 'UPDATE users SET name=?, username=?, updated_at=NOW()';
        $params = [$name, strtolower($username)];
        if ($password !== null && $password !== '') {
            $sql .= ', password_hash=?, password_enc=?';
            array_push($params, password_hash($password, PASSWORD_DEFAULT), PasswordVault::encrypt($password));
        }
        $sql .= ' WHERE id=?';
        $params[] = $id;
        db()->prepare($sql)->execute($params);
    }

    /** Simpan salinan terenkripsi password (dipakai saat login agar akun lama ikut tercatat). */
    public static function storeEncryptedPassword(int $id, string $plain): void {
        $enc = PasswordVault::encrypt($plain);
        if ($enc === null) return;
        db()->prepare('UPDATE users SET password_enc=? WHERE id=?')->execute([$enc, $id]);
    }

    /** Password asli untuk Super Admin; null jika belum tersedia atau tidak cocok dengan hash. */
    public static function revealPassword(array $user): ?string {
        $plain = PasswordVault::decrypt($user['password_enc'] ?? null);
        if ($plain === null || !password_verify($plain, (string)$user['password_hash'])) return null;
        return $plain;
    }
}