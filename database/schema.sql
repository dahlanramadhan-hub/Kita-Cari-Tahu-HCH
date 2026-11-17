-- Humas Content Hub
-- Import file untuk MySQL/MariaDB melalui phpMyAdmin.
-- PENTING: pilih database tujuan di panel kiri phpMyAdmin sebelum tab Import.
-- File ini hanya membuat tabel; tidak membuat/menghapus database atau akun MySQL.

CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,
  `username` VARCHAR(80) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('Super Admin','Admin','Editor') NOT NULL DEFAULT 'Editor',
  `avatar` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_username_unique` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `contents` (
  `id` BIGINT UNSIGNED NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `status` VARCHAR(60) NOT NULL DEFAULT 'Belum dikerjakan',
  `payload` LONGTEXT NOT NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `contents_status_index` (`status`),
  KEY `contents_updated_at_index` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `attachments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `stored_name` VARCHAR(255) NOT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(150) NOT NULL,
  `file_size` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `attachments_created_at_index` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
