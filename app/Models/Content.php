<?php
declare(strict_types=1);

final class Content {
    public static function all(): array {
        $rows = db()->query('SELECT payload FROM contents ORDER BY created_at DESC, id DESC')->fetchAll();
        return array_values(array_filter(array_map(
            static fn(array $row) => json_decode($row['payload'], true),
            $rows
        ), 'is_array'));
    }

    public static function find(int $id): ?array {
        $stmt = db()->prepare('SELECT payload FROM contents WHERE id=? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) return null;
        $decoded = json_decode($row['payload'], true);
        return is_array($decoded) ? $decoded : null;
    }

    public static function save(array $item): void {
        $id = (int)($item['id'] ?? 0);
        if ($id <= 0) throw new InvalidArgumentException('ID konten tidak valid.');
        $title = mb_substr((string)($item['title'] ?? 'Konten tanpa judul'), 0, 255);
        $status = mb_substr((string)($item['status'] ?? 'Belum dikerjakan'), 0, 60);
        $json = json_encode($item, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $stmt = db()->prepare(
            'INSERT INTO contents (id,title,status,payload,created_at,updated_at)
             VALUES (?,?,?,?,NOW(),NOW())
             ON DUPLICATE KEY UPDATE title=VALUES(title),status=VALUES(status),payload=VALUES(payload),updated_at=NOW()'
        );
        $stmt->execute([$id, $title, $status, $json]);
    }

    public static function deleteMissing(array $ids): void {
        if (!$ids) {
            db()->exec('DELETE FROM contents');
            return;
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = db()->prepare("DELETE FROM contents WHERE id NOT IN ($placeholders)");
        $stmt->execute($ids);
    }
}
