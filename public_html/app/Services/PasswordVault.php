<?php
declare(strict_types=1);

/**
 * Menyimpan salinan password terenkripsi (AES-256-GCM) agar Super Admin bisa melihatnya.
 * Kunci diambil dari APP_KEY di file .env. Login tetap memakai password_hash().
 */
final class PasswordVault {
    private static function key(): ?string {
        return (APP_KEY !== '' && function_exists('openssl_encrypt')) ? hash('sha256', APP_KEY, true) : null;
    }

    public static function ready(): bool {
        return self::key() !== null;
    }

    public static function encrypt(string $plain): ?string {
        $key = self::key();
        if ($key === null || $plain === '') return null;
        $iv = random_bytes(12);
        $cipher = openssl_encrypt($plain, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
        return $cipher === false ? null : base64_encode($iv . $tag . $cipher);
    }

    public static function decrypt(?string $stored): ?string {
        $key = self::key();
        if ($key === null || !$stored) return null;
        $raw = base64_decode($stored, true);
        if ($raw === false || strlen($raw) < 29) return null;
        $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', $key, OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
        return $plain === false ? null : $plain;
    }
}