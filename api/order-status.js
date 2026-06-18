const { json, methodNotAllowed } = require("../server/sales-config");
const { syncOrderWithMidtrans } = require("../server/payment-sync");
const { findLicenseByOrderId, findOrderByAccessToken } = require("../server/supabase-rest");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);

  try {
    const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const token = String(url.searchParams.get("token") || "").trim();
    if (token.length < 20) return json(res, 400, { error: "invalid_token" });

    const order = await findOrderByAccessToken(token);
    if (!order) return json(res, 404, { error: "order_not_found" });

    const syncResult = await syncOrderWithMidtrans(order, "order_status");
    const currentOrder = syncResult.order || order;
    const license = await findLicenseByOrderId(currentOrder.order_id);
    return json(res, 200, {
      orderId: currentOrder.order_id,
      status: currentOrder.status,
      paymentStatus: currentOrder.payment_status,
      packageLabel: currentOrder.package_label,
      amount: currentOrder.amount,
      practiceName: currentOrder.practice_name,
      ownerName: currentOrder.owner_name,
      email: currentOrder.email,
      whatsapp: currentOrder.whatsapp,
      deviceFingerprint: currentOrder.device_fingerprint,
      paymentSyncWarning: syncResult.error ? "Pembayaran belum bisa dicek ulang otomatis. Silakan cek beberapa saat lagi." : null,
      license: license
        ? {
            licenseId: license.license_id,
            licenseKey: license.license_key,
            licenseType: license.license_type,
            expiresAt: license.expires_at,
          }
        : null,
    });
  } catch (error) {
    return json(res, 500, { error: "order_status_failed", message: error.message });
  }
};
