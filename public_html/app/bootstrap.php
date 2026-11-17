<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/config/app.php';
require_once dirname(__DIR__) . '/config/database.php';

spl_autoload_register(static function (string $class): void {
    $folders = [
        dirname(__DIR__) . '/app/Controllers/',
        dirname(__DIR__) . '/app/Models/',
        dirname(__DIR__) . '/app/Services/',
    ];
    foreach ($folders as $folder) {
        $file = $folder . $class . '.php';
        if (is_file($file)) { require_once $file; return; }
    }
});

AuthService::bootSession();
