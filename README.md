# MedPraktik Web

Landing page statis untuk MedPraktik, aplikasi RME offline-first untuk praktik dokter kecil/mandiri.

## Struktur

- `index.html` - konten utama landing page.
- `styles.css` - styling klinis-modern.
- `script.js` - interaksi ringan seperti galeri screenshot dan CTA WhatsApp.
- `assets/` - logo dan screenshot yang dipakai halaman.
- `api/` - Vercel Serverless Functions untuk order, Midtrans webhook, status order, fingerprint, dan admin approval.
- `server/` - helper backend untuk Supabase REST, Midtrans, license codec, dan fulfillment.
- `supabase/migrations/0001_sales_flow.sql` - schema awal order/payment/license/audit.
- `admin.html` - admin ringan untuk melihat order dan approve license.

## Deploy

Target deploy berikutnya: Vercel project `medpraktik-web`.

Flow v1 yang tersedia:

1. Form Trial/Beli/Upgrade membuat order di Supabase.
2. Basic, Basic Plus, dan upgrade membuat Midtrans Snap transaction.
3. Midtrans webhook memperbarui status pembayaran.
4. License key `ERM2-*` dibuat otomatis untuk order aman, atau masuk review admin.
5. Status order dibuka memakai token acak dari order.

Environment Vercel yang dibutuhkan lihat `.env.example`.

Info Midtrans sandbox/production diisi sebagai environment variable Vercel, bukan ditulis ke repo:

- `MIDTRANS_SERVER_KEY` untuk backend Snap dan webhook signature.
- `MIDTRANS_CLIENT_KEY` disimpan sebagai referensi konfigurasi Midtrans; flow saat ini memakai `redirect_url` Snap dari backend.
- `MIDTRANS_MERCHANT_ID` untuk identifikasi merchant di dashboard Midtrans.
- `MIDTRANS_ENV=sandbox` selama preview testing.

Webhook Midtrans:

- URL: `https://<domain>/api/midtrans-webhook`
- Sandbox dulu sampai flow end-to-end lulus.
- Signature diverifikasi memakai `SHA512(order_id + status_code + gross_amount + MIDTRANS_SERVER_KEY)`.

Admin:

- Buka `/admin.html`.
- Masukkan `ORDER_ADMIN_TOKEN`.
- Approve hanya untuk order yang sudah punya fingerprint.

Catatan keamanan:

- Jangan expose `SUPABASE_SERVICE_ROLE_KEY`, `MIDTRANS_SERVER_KEY`, atau `ERM_LICENSE_SECRET` ke browser.
- Jalankan migration Supabase dulu sebelum deploy production.
- Email otomatis memakai Resend bila `RESEND_API_KEY` dan `LICENSE_EMAIL_FROM` diisi. Jika kosong, license tetap dibuat tetapi perlu follow-up manual.

## Kontak

- WhatsApp: +62 838-9698-5999
- Email: supportmedpraktik@gmail.com
