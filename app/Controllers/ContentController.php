<?php
declare(strict_types=1);

final class ContentController {
    public static function save(): never {
        $actor = AuthService::requireUser();
        $input = Response::input();
        $incoming = $input['contents'] ?? null;
        if (!is_array($incoming)) Response::json(['message' => 'Data konten tidak valid.'], 422);

        $isAdmin = in_array($actor['role'], ['Super Admin','Admin'], true);
        $oldItems = [];
        foreach (Content::all() as $old) $oldItems[(string)($old['id'] ?? '')] = $old;
        $newItems = [];
        foreach ($incoming as $item) {
            if (!is_array($item) || empty($item['id'])) continue;
            $id = (string)$item['id'];
            if (!$isAdmin) {
                if (!isset($oldItems[$id])) Response::json(['message' => 'Editor tidak dapat membuat atau menghapus proyek.'], 403);
                self::assertEditorChangesAllowed($oldItems[$id], $item);
            }
            $newItems[$id] = UploadService::persistInlineFiles($item);
        }
        if (!$isAdmin && count($newItems) !== count($oldItems)) {
            Response::json(['message' => 'Editor tidak dapat membuat atau menghapus proyek.'], 403);
        }

        $pdo = db();
        $pdo->beginTransaction();
        try {
            foreach ($newItems as $item) Content::save($item);
            if ($isAdmin) Content::deleteMissing(array_map('intval', array_keys($newItems)));
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        Response::json(['ok' => true, 'contents' => Content::all()]);
    }

    private static function assertEditorChangesAllowed(array $old, array $new): void {
        $mutable = ['drafts','comments','caption','captionComments','captionRevisions','status','updatedAt'];
        foreach (array_unique(array_merge(array_keys($old), array_keys($new))) as $key) {
            if (in_array($key, $mutable, true)) continue;
            if (($old[$key] ?? null) !== ($new[$key] ?? null)) {
                Response::json(['message' => 'Editor hanya dapat mengirim draft/revisi dan komentar; informasi proyek utama tidak dapat diubah.'], 403);
            }
        }
        if (($old['status'] ?? '') !== ($new['status'] ?? '') && !in_array(($new['status'] ?? ''), ['Revisi','Belum dikerjakan'], true)) {
            Response::json(['message' => 'Editor tidak memiliki izin mengubah status menjadi disetujui atau publish.'], 403);
        }
        if (($old['captionApproved'] ?? false) !== ($new['captionApproved'] ?? false) ||
            ($old['final'] ?? null) !== ($new['final'] ?? null)) {
            Response::json(['message' => 'Editor tidak memiliki izin menyetujui caption atau file final.'], 403);
        }
        $oldDrafts = $old['drafts'] ?? [];
        $newDrafts = $new['drafts'] ?? [];
        if (count($newDrafts) < count($oldDrafts)) {
            Response::json(['message' => 'Editor tidak dapat menghapus riwayat draft.'], 403);
        }
        foreach ($oldDrafts as $index => $draft) {
            if (isset($newDrafts[$index])) {
                $before = $draft; $after = $newDrafts[$index];
                unset($before['comments'], $after['comments']);
                if ($before !== $after) Response::json(['message' => 'Editor tidak dapat mengubah draft lama.'], 403);
            }
        }
    }
}
