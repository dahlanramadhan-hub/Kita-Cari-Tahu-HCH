# Humas Content Hub — PHP Native MVC

Aplikasi ini merupakan konversi modular dari file HTML yang diberikan. Struktur visual, CSS, markup dashboard, modal, dan interaksi antarmuka dipertahankan; backend dipisahkan ke PHP, MySQL, dan penyimpanan file server.

## Teknologi

- PHP 8.1 atau lebih baru
- MySQL 5.7+ / MariaDB 10.3+
- PDO MySQL
- JavaScript vanilla (antarmuka asli)
- Session PHP + password hashing
- Apache dengan mod_rewrite (umumnya tersedia di Hostinger)

## Struktur

```text
humas-content-hub/
├── app/
│   ├── Controllers/       # Endpoint dan aturan akses
│   ├── Models/            # Query database
│   ├── Services/          # Session, respons API, upload
│   └── bootstrap.php
├── config/                # Konfigurasi aplikasi dan database
├── database/schema.sql    # Struktur database
├── public/
│   ├── api/               # Front controller API
│   ├── assets/css/        # CSS asli
│   ├── assets/js/         # JavaScript asli + integrasi API
│   ├── assets/images/     # Logo
│   └── index.php          # Halaman aplikasi
├── routes/
├── storage/
│   ├── logs/
│   └── uploads/           # File konten yang diunggah
├── .env.example
└── .htaccess
```

## Instalasi di Hostinger (shared hosting)

1. Buat database MySQL dari hPanel → Databases → Management.
2. Catat nama database, username database, dan password database.
3. Upload seluruh isi folder proyek ini ke `public_html` (bukan hanya folder `public`).
4. Pastikan file `.htaccess` berada langsung di `public_html`.
5. Salin `.env.example` menjadi `.env`, lalu isi konfigurasi database:
   - `DB_HOST` biasanya `localhost`
   - `DB_DATABASE` nama database dari hPanel
   - `DB_USERNAME` username database dari hPanel
   - `DB_PASSWORD` password database dari hPanel
   - `APP_URL` alamat domain kamu
6. Buka phpMyAdmin dari hPanel, pilih database yang dibuat, lalu Import file `database/schema.sql`.
7. Pastikan folder `storage/uploads` dan `storage/logs` dapat ditulis oleh PHP. Umumnya permission folder `755` atau `775`.
8. Buka domain melalui browser.

### Pengaturan PHP

Di hPanel → PHP Configuration, gunakan PHP 8.1+ dan aktifkan ekstensi `pdo_mysql`, `mbstring`, `fileinfo` serta `openssl`.

Untuk unggahan file, sesuaikan batas PHP (jika tersedia):
- `upload_max_filesize = 64M`
- `post_max_size = 256M`
- `memory_limit = 512M`
- `max_execution_time = 120`

## Akun awal

Akun awal dibuat otomatis saat API pertama kali dijalankan pada database kosong:

| Role | Username | Password awal |
|---|---|---|
| Super Admin | `superadmin` | `Super123!` |
| Admin | `admin` | `Admin123!` |
| Editor | `editor` | `Editor123!` |

**Penting:** setelah login pertama, segera ubah password akun awal melalui menu Kelola Akun / Informasi Akun. Password disimpan sebagai hash dan tidak dapat dibaca kembali oleh aplikasi.

## Penyimpanan dan keamanan

- Akun disimpan pada tabel `users`; password memakai `password_hash()` dan diverifikasi dengan `password_verify()`.
- Data proyek, riwayat draft, komentar, caption, status, dan jadwal disimpan pada tabel `contents` dalam payload JSON agar struktur alur kerja lama tetap utuh.
- File upload dipindahkan dari data URL browser ke `storage/uploads`, dengan metadata pada tabel `attachments`.
- File diakses melalui endpoint PHP yang mensyaratkan sesi login.
- Endpoint perubahan data memeriksa sesi, token CSRF, dan role.
- File `.env`, `app`, `config`, `database`, `routes`, dan `storage` diblokir dari akses HTTP melalui `.htaccess`.
- Jangan menghapus folder `storage/uploads` karena berisi file yang diunggah.

## Catatan teknis

- Data proyek otomatis disinkronkan ke server ketika dashboard memperbarui daftar kartu. Pastikan koneksi internet aktif saat melakukan perubahan.
- Penyimpanan menggunakan tabel `contents` dengan kolom `payload` agar bentuk data proyek yang sudah digunakan oleh UI lama tidak perlu didesain ulang.
- Backup berkala database dan folder `storage/uploads` sangat disarankan.
- Untuk deployment dengan Nginx, aturan rewrite Apache pada `.htaccess` perlu diterjemahkan ke konfigurasi Nginx.
