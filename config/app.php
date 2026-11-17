<?php
declare(strict_types=1);

function env_value(string $key, ?string $default = null): ?string {
    static $env = null;
    if ($env === null) {
        $env = [];
        $file = dirname(__DIR__) . '/.env';
        if (is_file($file)) {
            foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                $line = trim($line);
                if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
                [$name, $value] = explode('=', $line, 2);
                $env[trim($name)] = trim(trim($value), "\"'");
            }
        }
    }
    $value = $_ENV[$key] ?? $_SERVER[$key] ?? $env[$key] ?? $default;
    return $value === null ? null : (string)$value;
}

define('APP_NAME', env_value('APP_NAME', 'Humas Content Hub'));
define('APP_ENV', env_value('APP_ENV', 'production'));
define('APP_DEBUG', filter_var(env_value('APP_DEBUG', 'false'), FILTER_VALIDATE_BOOLEAN));
define('APP_URL', rtrim((string)env_value('APP_URL', ''), '/'));
define('STORAGE_PATH', dirname(__DIR__) . '/storage');
