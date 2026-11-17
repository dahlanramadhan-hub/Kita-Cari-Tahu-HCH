<?php
declare(strict_types=1);

final class AccountController {
    /** Tambah, ubah, hapus akun. Hanya Super Admin. */
    public static function save() {
        $actor = AuthService::requireSuperAdmin();
        $incoming = Response::input()['accounts'] ?? null;
        if (!is_array($incoming)) Response::json(['message' => 'Data akun tidak valid.'], 422);

        $pdo = db();
        $pdo->beginTransaction();
        try {
            $existingById = [];
            foreach ($pdo->query('SELECT * FROM users')->fetchAll() as $row) $existingById[(int)$row['id']] = $row;

            $seen = [];
            $keepIds = [];
            foreach ($incoming as $account) {
                if (!is_array($account)) continue;
                $id = (int)($account['id'] ?? 0);
                $name = trim((string)($account['name'] ?? ''));
                $username = strtolower(trim((string)($account['username'] ?? '')));
                $role = (string)($account['role'] ?? 'Editor');
                $password = (string)($account['password'] ?? '');
                $old = $existingById[$id] ?? null;

                if ($name === '' || $username === '') throw new InvalidArgumentException('Nama dan username akun wajib diisi.');
                if (!in_array($role, ['Super Admin', 'Admin', 'Editor'], true)) throw new InvalidArgumentException('Role akun tidak valid.');
                if (isset($seen[$username])) throw new InvalidArgumentException('Username tidak boleh duplikat.');
                $seen[$username] = true;

                if ($role === 'Super Admin' && (!$old || $old['role'] !== 'Super Admin')) {
                    throw new RuntimeException('Akun Super Admin tidak dapat ditambahkan.');
                }
                if ($old && $old['role'] === 'Super Admin' && $role !== 'Super Admin') {
                    throw new RuntimeException('Role Super Admin tidak dapat diturunkan.');
                }

                if ($old) {
                    $keepIds[] = $id;
                    $sql = 'UPDATE users SET name=?,username=?,role=?,updated_at=NOW()';
                    $params = [$name, $username, $role];
                    if ($password !== '') {
                        $sql .= ',password_hash=?,password_enc=?';
                        array_push($params, password_hash($password, PASSWORD_DEFAULT), PasswordVault::encrypt($password));
                    }
                    $params[] = $id;
                    $pdo->prepare($sql . ' WHERE id=?')->execute($params);
                } else {
                    if ($password === '') throw new InvalidArgumentException('Password wajib diisi untuk akun baru.');
                    $pdo->prepare('INSERT INTO users (name,username,password_hash,password_enc,role,created_at,updated_at) VALUES (?,?,?,?,?,NOW(),NOW())')
                        ->execute([$name, $username, password_hash($password, PASSWORD_DEFAULT), PasswordVault::encrypt($password), $role]);
                }
            }

            // Akun yang tidak ada di daftar dihapus, kecuali Super Admin dan akun yang sedang dipakai.
            foreach ($existingById as $oldId => $old) {
                if ($old['role'] === 'Super Admin' || $oldId === (int)$actor['id']) continue;
                if (!in_array($oldId, $keepIds, true)) $pdo->prepare('DELETE FROM users WHERE id=?')->execute([$oldId]);
            }
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        $_SESSION['user'] = AuthService::publicUser(User::find((int)$actor['id']));
        Response::json(['accounts' => User::all(), 'user' => $_SESSION['user']]);
    }

    /** Lihat password satu akun. Hanya Super Admin. */
    public static function password() {
        AuthService::requireSuperAdmin();
        if (!PasswordVault::ready()) {
            Response::json(['password' => null, 'message' => 'APP_KEY belum diisi di file .env, jadi password belum bisa ditampilkan.']);
        }
        $user = User::find((int)($_GET['id'] ?? 0));
        if (!$user) Response::json(['message' => 'Akun tidak ditemukan.'], 404);
        $plain = User::revealPassword($user);
        Response::json([
            'password' => $plain,
            'message' => $plain === null ? 'Password akun ini belum tercatat. Akan tampil setelah akun tersebut login atau passwordnya diganti.' : '',
        ]);
    }
}