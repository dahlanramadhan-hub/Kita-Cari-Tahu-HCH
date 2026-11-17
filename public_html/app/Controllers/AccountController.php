<?php
declare(strict_types=1);

final class AccountController {
    public static function save(): never {
        $actor = AuthService::requireAdmin();
        $input = Response::input();
        $incoming = $input['accounts'] ?? null;
        if (!is_array($incoming)) Response::json(['message' => 'Data akun tidak valid.'], 422);

        $pdo = db();
        $pdo->beginTransaction();
        try {
            $existing = $pdo->query('SELECT * FROM users')->fetchAll();
            $existingById = [];
            foreach ($existing as $row) $existingById[(int)$row['id']] = $row;

            $seen = [];
            foreach ($incoming as $account) {
                if (!is_array($account)) continue;
                $id = (int)($account['id'] ?? 0);
                $name = trim((string)($account['name'] ?? ''));
                $username = strtolower(trim((string)($account['username'] ?? '')));
                $role = (string)($account['role'] ?? 'Editor');
                $password = (string)($account['password'] ?? '');
                if ($name === '' || $username === '') throw new InvalidArgumentException('Nama dan username akun wajib diisi.');
                if (!in_array($role, ['Super Admin','Admin','Editor'], true)) throw new InvalidArgumentException('Role akun tidak valid.');
                if ($role === 'Super Admin' && $actor['role'] !== 'Super Admin') throw new RuntimeException('Hanya Super Admin yang dapat mengelola akun Super Admin.');
                if (isset($seen[$username])) throw new InvalidArgumentException('Username tidak boleh duplikat.');
                $seen[$username] = true;

                if ($id > 0 && isset($existingById[$id])) {
                    $old = $existingById[$id];
                    if ($old['role'] === 'Super Admin' && $actor['role'] !== 'Super Admin') {
                        if ($name !== $old['name'] || $username !== $old['username'] || $role !== 'Super Admin' || $password !== '') {
                            throw new RuntimeException('Admin tidak dapat mengubah akun Super Admin.');
                        }
                        continue;
                    }
                    if ($old['role'] === 'Super Admin' && $role !== 'Super Admin') throw new RuntimeException('Role Super Admin tidak dapat diturunkan.');
                    $sql = 'UPDATE users SET name=?,username=?,role=?,updated_at=NOW()';
                    $params = [$name,$username,$role];
                    if ($password !== '') { $sql .= ',password_hash=?'; $params[] = password_hash($password, PASSWORD_DEFAULT); }
                    $sql .= ' WHERE id=?'; $params[] = $id;
                    $pdo->prepare($sql)->execute($params);
                } else {
                    if ($password === '') throw new InvalidArgumentException('Password wajib diisi untuk akun baru.');
                    if ($role === 'Super Admin') throw new RuntimeException('Akun Super Admin tidak dapat ditambahkan dari form ini.');
                    $pdo->prepare('INSERT INTO users (name,username,password_hash,role,created_at,updated_at) VALUES (?,?,?,?,NOW(),NOW())')
                        ->execute([$name,$username,password_hash($password,PASSWORD_DEFAULT),$role]);
                }
            }

            // Sinkronkan penghapusan akun berdasarkan daftar dari aplikasi, kecuali Super Admin dan akun aktif.
            $keepIds = [];
            foreach ($incoming as $account) if (!empty($account['id'])) $keepIds[] = (int)$account['id'];
            foreach ($existing as $old) {
                $oldId = (int)$old['id'];
                if ($old['role'] === 'Super Admin' || $oldId === (int)$actor['id']) continue;
                if (!in_array($oldId, $keepIds, true)) {
                    $pdo->prepare('DELETE FROM users WHERE id=?')->execute([$oldId]);
                }
            }
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        $fresh = User::find((int)$actor['id']);
        $_SESSION['user'] = AuthService::publicUser($fresh);
        Response::json(['accounts' => User::all(), 'user' => $_SESSION['user']]);
    }
}
