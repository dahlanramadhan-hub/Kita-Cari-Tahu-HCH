<?php
declare(strict_types=1);

final class UploadService {
    public static function persistInlineFiles(mixed $value): mixed {
        if (!is_array($value)) return $value;
        foreach ($value as $key => $item) {
            if ($key === 'dataUrl' && is_string($item) && preg_match('#^data:([^;]+);base64,(.+)$#s', $item, $m)) {
                $mime = $m[1];
                $binary = base64_decode($m[2], true);
                if ($binary === false) throw new InvalidArgumentException('Isi file tidak valid.');
                if (strlen($binary) > 50 * 1024 * 1024) throw new InvalidArgumentException('Ukuran setiap file maksimal 50 MB.');
                $allowed = [
                    'image/jpeg','image/png','image/gif','image/webp',
                    'video/mp4','video/quicktime','video/x-msvideo','video/x-matroska',
                    'audio/mpeg','audio/mp4','audio/wav','audio/x-wav','application/pdf','text/csv',
                    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    'text/plain','application/zip','application/x-zip-compressed'
                ];
                if (!in_array($mime, $allowed, true)) throw new InvalidArgumentException('Jenis file tidak diizinkan: '.$mime);
                $original = basename((string)($value['name'] ?? 'file'));
                $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
                $stored = bin2hex(random_bytes(18)) . ($ext ? '.'.$ext : '');
                $dir = STORAGE_PATH . '/uploads';
                if (!is_dir($dir)) mkdir($dir, 0750, true);
                $path = $dir . '/' . $stored;
                if (file_put_contents($path, $binary, LOCK_EX) === false) throw new RuntimeException('Gagal menyimpan file ke server.');
                $stmt = db()->prepare('INSERT INTO attachments (stored_name,original_name,mime_type,file_size,created_at) VALUES (?,?,?,?,NOW())');
                $stmt->execute([$stored, $original, $mime, strlen($binary)]);
                $value['fileId'] = (int)db()->lastInsertId();
                $value['fileUrl'] = '/api/file?id=' . $value['fileId'];
                unset($value['dataUrl']);
                continue;
            }
            $value[$key] = self::persistInlineFiles($item);
        }
        return $value;
    }

    public static function stream(int $id): never {
        AuthService::requireUser();
        $stmt = db()->prepare('SELECT * FROM attachments WHERE id=? LIMIT 1');
        $stmt->execute([$id]);
        $file = $stmt->fetch();
        if (!$file) { http_response_code(404); exit('File tidak ditemukan.'); }
        $path = STORAGE_PATH . '/uploads/' . $file['stored_name'];
        if (!is_file($path)) { http_response_code(404); exit('File tidak tersedia.'); }
        header('Content-Type: '.$file['mime_type']);
        header('Content-Length: '.filesize($path));
        header('Content-Disposition: inline; filename*=UTF-8\'\''.rawurlencode($file['original_name']));
        header('X-Content-Type-Options: nosniff');
        readfile($path);
        exit;
    }
}
