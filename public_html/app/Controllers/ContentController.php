<?php
declare(strict_types=1);

final class ContentController {
    /** Status yang boleh diset oleh Editor (alur saling balas draft/revisi). */
    private const EDITOR_STATUSES = ['Belum Dikerjakan', 'Menunggu Review', 'Revisi'];

    public static function save() {
        $actor = AuthService::requireUser();
        $input = Response::input();
        $incoming = $input['contents'] ?? null;
        if (!is_array($incoming)) Response::json(['message' => 'Data konten tidak valid.'], 422);

        $isAdmin = in_array($actor['role'], ['Super Admin', 'Admin'], true);
        $oldItems = [];
        foreach (Content::all() as $old) $oldItems[(string)($old['id'] ?? '')] = $old;

        $newItems = [];
        foreach ($incoming as $item) {
            if (!is_array($item) || empty($item['id'])) continue;
            $id = (string)$item['id'];
            if (isset($oldItems[$id])) {
                // Gabungkan dengan data server agar balasan/draft orang lain tidak hilang
                // saat browser memegang salinan lama.
                $item = self::mergeThreads($oldItems[$id], $item);
            }
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

    /** Gabungkan draft, komentar, dan revisi caption: data lama tidak boleh hilang. */
    private static function mergeThreads(array $old, array $new): array {
        $oldDrafts = is_array($old['drafts'] ?? null) ? $old['drafts'] : [];
        $newDrafts = is_array($new['drafts'] ?? null) ? $new['drafts'] : [];
        $merged = $oldDrafts;
        foreach ($newDrafts as $nd) {
            if (!is_array($nd)) continue;
            $found = null;
            foreach ($merged as $i => $md) {
                if (self::sameDraft($md, $nd)) { $found = $i; break; }
            }
            if ($found === null) { $merged[] = $nd; continue; }
            $comments = self::unionComments($merged[$found]['comments'] ?? [], $nd['comments'] ?? []);
            $keepFile = $merged[$found];
            $merged[$found] = array_merge($keepFile, $nd);
            $merged[$found]['comments'] = $comments;
            // fileUrl/fileId milik server tidak boleh hilang
            foreach (['fileUrl', 'fileId'] as $k) {
                if (isset($keepFile[$k]) && !isset($nd[$k])) $merged[$found][$k] = $keepFile[$k];
            }
        }
        $new['drafts'] = array_values($merged);

        $oldCaps = is_array($old['captionRevisions'] ?? null) ? $old['captionRevisions'] : [];
        $newCaps = is_array($new['captionRevisions'] ?? null) ? $new['captionRevisions'] : [];
        $caps = $oldCaps;
        foreach ($newCaps as $nc) {
            if (!is_array($nc)) continue;
            $found = null;
            foreach ($caps as $i => $mc) {
                if (($mc['text'] ?? null) === ($nc['text'] ?? null) && ($mc['date'] ?? null) === ($nc['date'] ?? null)) { $found = $i; break; }
            }
            if ($found === null) { $caps[] = $nc; continue; }
            $comments = self::unionComments($caps[$found]['comments'] ?? [], $nc['comments'] ?? []);
            $caps[$found] = array_merge($caps[$found], $nc);
            $caps[$found]['comments'] = $comments;
        }
        $new['captionRevisions'] = array_values($caps);
        return $new;
    }

    private static function sameDraft(array $a, array $b): bool {
        if (!empty($a['fileId']) && !empty($b['fileId'])) return (string)$a['fileId'] === (string)$b['fileId'];
        return ($a['name'] ?? null) === ($b['name'] ?? null) && ($a['date'] ?? null) === ($b['date'] ?? null);
    }

    private static function unionComments($a, $b): array {
        $out = is_array($a) ? array_values($a) : [];
        $seen = [];
        foreach ($out as $c) $seen[self::commentKey($c)] = true;
        foreach (is_array($b) ? $b : [] as $c) {
            $k = self::commentKey($c);
            if (!isset($seen[$k])) { $out[] = $c; $seen[$k] = true; }
        }
        return $out;
    }

    private static function commentKey($c): string {
        return md5(($c['user'] ?? '') . '|' . ($c['date'] ?? '') . '|' . ($c['text'] ?? ''));
    }

    /** Normalisasi untuk perbandingan: urutan key tidak berpengaruh, finalApproved=false dianggap tidak ada. */
    private static function canon($v) {
        if (!is_array($v)) return $v;
        $out = [];
        foreach ($v as $k => $x) {
            if ($k === 'finalApproved' && !$x) continue;
            $out[$k] = self::canon($x);
        }
        if (array_keys($out) !== range(0, count($out) - 1)) ksort($out);
        return $out;
    }

    private static function assertEditorChangesAllowed(array $old, array $new): void {
        $mutable = ['drafts', 'comments', 'caption', 'captionComments', 'captionRevisions', 'status', 'updatedAt'];
        foreach (array_unique(array_merge(array_keys($old), array_keys($new))) as $key) {
            if (in_array($key, $mutable, true)) continue;
            if (self::canon($old[$key] ?? null) !== self::canon($new[$key] ?? null)) {
                Response::json(['message' => 'Editor hanya dapat mengirim draft/revisi dan komentar; informasi proyek utama tidak dapat diubah.'], 403);
            }
        }
        $oldStatus = (string)($old['status'] ?? '');
        $newStatus = (string)($new['status'] ?? '');
        if ($oldStatus !== $newStatus && !in_array($newStatus, self::EDITOR_STATUSES, true)) {
            Response::json(['message' => 'Editor tidak memiliki izin mengubah status menjadi disetujui atau publish.'], 403);
        }
        if (!empty($old['captionApproved']) !== !empty($new['captionApproved']) ||
            ($old['final'] ?? null) !== ($new['final'] ?? null)) {
            Response::json(['message' => 'Editor tidak memiliki izin menyetujui caption atau file final.'], 403);
        }
        $oldDrafts = $old['drafts'] ?? [];
        $newDrafts = $new['drafts'] ?? [];
        if (count($newDrafts) < count($oldDrafts)) {
            Response::json(['message' => 'Editor tidak dapat menghapus riwayat draft.'], 403);
        }
        foreach ($oldDrafts as $index => $draft) {
            if (!isset($newDrafts[$index])) continue;
            $before = $draft; $after = $newDrafts[$index];
            unset($before['comments'], $after['comments']);
            if (self::canon($before) !== self::canon($after)) {
                Response::json(['message' => 'Editor tidak dapat mengubah draft lama.'], 403);
            }
        }
    }
}
