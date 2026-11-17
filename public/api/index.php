<?php
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

try {
    // The SQL schema is installed through database/schema.sql in phpMyAdmin.
    User::seedDefaults();

    $route = trim((string)($_GET['route'] ?? ''), '/');
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

    if ($method !== 'GET') AuthService::checkCsrf();

    if (($route === '' || $route === 'bootstrap') && $method === 'GET') {
    AuthController::bootstrap();
}
    if ($route === 'login' && $method === 'POST') AuthController::login();
    if ($route === 'logout' && $method === 'POST') AuthController::logout();
    if ($route === 'accounts' && $method === 'POST') AccountController::save();
    if ($route === 'profile' && $method === 'POST') ProfileController::save();
    if ($route === 'contents' && $method === 'POST') ContentController::save();
    if ($route === 'file' && $method === 'GET') FileController::show();

    Response::json(['message' => 'Endpoint tidak ditemukan.'], 404);
} catch (Throwable $e) {
    Response::fail($e);
}
