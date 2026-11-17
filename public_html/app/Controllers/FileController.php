<?php
declare(strict_types=1);

final class FileController {
    public static function show() {
        $id = (int)($_GET['id'] ?? 0);
        if ($id <= 0) { http_response_code(400); exit('ID file tidak valid.'); }
        UploadService::stream($id);
    }
}
