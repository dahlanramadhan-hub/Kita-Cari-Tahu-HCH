<?php
declare(strict_types=1);

function db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    $host = env_value('DB_HOST', 'localhost');
    $port = env_value('DB_PORT', '3306');
    $name = env_value('DB_DATABASE', '');
    $user = env_value('DB_USERNAME', '');
    $pass = env_value('DB_PASSWORD', '');

    if ($name === '' || $user === '') {
        throw new RuntimeException('Konfigurasi database belum lengkap. Periksa DB_DATABASE dan DB_USERNAME pada file .env.');
    }

    $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}
