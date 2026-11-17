<?php
declare(strict_types=1);

final class User {
    public static function seedDefaults(): void {
        $count = (int)db()->query('SELECT COUNT(*) FROM users')->fetchColumn();
        if ($count > 0) return;
        $stmt = db()->prepare('INSERT INTO users (name, username, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())');
        $defaults = [
            ['Super Admin Humas', 'superadmin', 'Super123!', 'Super Admin'],
            ['Admin Humas', 'admin', 'Admin123!', 'Admin'],
            ['Editor Humas', 'editor', 'Editor123!', 'Editor'],
        ];
        foreach ($defaults as [$name, $username, $password, $role]) {
            $stmt->execute([$name, $username, password_hash($password, PASSWORD_DEFAULT), $role]);
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
            $sql .= ', password_hash=?';
            $params[] = password_hash($password, PASSWORD_DEFAULT);
        }
        $sql .= ' WHERE id=?';
        $params[] = $id;
        db()->prepare($sql)->execute($params);
    }
}
