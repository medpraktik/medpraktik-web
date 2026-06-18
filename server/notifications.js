const { optionalEnv, siteUrl } = require("./sales-config");
const { insertRow } = require("./supabase-rest");

const WHATSAPP_NUMBER = "6283896985999";

function statusUrl(order) {
  return `${siteUrl()}/?order=${encodeURIComponent(order.access_token)}#status-order`;
}

function whatsappUrl(message) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

function nextStepForOrder(order) {
  if (order.package_key === "trial") {
    return "Tunggu link installer resmi, install MedPraktik, lalu kirim fingerprint perangkat melalui halaman status order.";
  }
  if (["basic", "basic_plus"].includes(order.package_key)) {
    return "Selesaikan pembayaran Midtrans. Setelah pembayaran terkonfirmasi, install MedPraktik dan kirim fingerprint perangkat melalui halaman status order.";
  }
  if (order.package_key === "upgrade_basic_to_basic_plus") {
    return "Selesaikan pembayaran Midtrans. Tim MedPraktik akan mereview upgrade dan aktivasi paket.";
  }
  return "Tim MedPraktik akan mereview request dan menghubungi Anda melalui WhatsApp/email.";
}

async function sendEmail({ to, subject, text, idempotencyKey }) {
  const apiKey = optionalEnv("RESEND_API_KEY");
  const from = optionalEnv("LICENSE_EMAIL_FROM");
  if (!apiKey || !from) return { sent: false, skipped: true };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend ${response.status}: ${body || response.statusText}`);
  }
  return { sent: true, skipped: false };
}

async function auditNotification(order, action, metadata) {
  try {
    await insertRow("audit_logs", {
      order_id: order.order_id,
      actor: "system",
      action,
      metadata,
    });
  } catch (error) {
    // Notification audit must not block order, payment, or license fulfillment.
  }
}

async function sendOrderCreatedEmail(order) {
  const link = statusUrl(order);
  const waLink = whatsappUrl(
    `Halo MedPraktik, saya ingin bantuan untuk Order ID ${order.order_id}. Kode status order: ${order.access_token}.`,
  );
  const text = [
    `Halo ${order.owner_name},`,
    "",
    "Order MedPraktik Anda sudah dibuat.",
    "",
    `Order ID: ${order.order_id}`,
    `Kode status order: ${order.access_token}`,
    `Paket: ${order.package_label}`,
    `Status pembayaran: ${order.payment_status}`,
    `Nama praktik: ${order.practice_name}`,
    "",
    `Cek status order: ${link}`,
    `Bantuan WhatsApp: ${waLink}`,
    "",
    `Langkah berikutnya: ${nextStepForOrder(order)}`,
    "",
    "Simpan kode status order ini. Kode tersebut dipakai untuk cek pembayaran, download installer, mengirim fingerprint, dan mengambil license key.",
  ].join("\n");

  try {
    const result = await sendEmail({
      to: order.email,
      subject: `Order MedPraktik dibuat - ${order.order_id}`,
      text,
      idempotencyKey: `order-created-${order.order_id}`,
    });
    await auditNotification(order, result.sent ? "order_email_sent" : "order_email_pending", {
      type: "order_created",
      skipped: result.skipped,
    });
    return result;
  } catch (error) {
    await auditNotification(order, "order_email_failed", {
      type: "order_created",
      message: error.message,
    });
    return { sent: false, skipped: false, error };
  }
}

async function sendLicenseEmail(order, license) {
  const link = statusUrl(order);
  const waLink = whatsappUrl(
    `Halo MedPraktik, saya ingin bantuan aktivasi untuk Order ID ${order.order_id}. License ID: ${license.license_id}.`,
  );
  const text = [
    `Halo ${order.owner_name},`,
    "",
    `License key MedPraktik untuk ${order.practice_name}:`,
    license.license_key,
    "",
    `License ID: ${license.license_id}`,
    `Paket: ${order.package_label}`,
    `Fingerprint: ${order.device_fingerprint}`,
    "",
    "Cara aktivasi:",
    "1. Copy license key di atas.",
    "2. Buka MedPraktik di laptop yang sudah terinstall.",
    "3. Paste license key ke layar Aktivasi/Lisensi.",
    "4. Klik Aktivasi.",
    "",
    `Cek status order: ${link}`,
    `Bantuan WhatsApp: ${waLink}`,
  ].join("\n");

  try {
    const result = await sendEmail({
      to: order.email,
      subject: `License Key MedPraktik - ${order.package_label}`,
      text,
      idempotencyKey: `license-${license.license_id}`,
    });
    return result.sent;
  } catch (error) {
    await auditNotification(order, "license_email_failed", {
      type: "license_key",
      license_id: license.license_id,
      message: error.message,
    });
    return false;
  }
}

module.exports = {
  sendLicenseEmail,
  sendOrderCreatedEmail,
  statusUrl,
  whatsappUrl,
};
