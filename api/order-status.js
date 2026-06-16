const { json, methodNotAllowed } = require("../server/sales-config");
const { findLicenseByOrderId, findOrderByAccessToken } = require("../server/supabase-rest");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);

  try {
    const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const token = String(url.searchParams.get("token") || "").trim();
    if (token.length < 20) return json(res, 400, { error: "invalid_token" });

    const order = await findOrderByAccessToken(token);
    if (!order) return json(res, 404, { error: "order_not_found" });

    const license = await findLicenseByOrderId(order.order_id);
    return json(res, 200, {
      orderId: order.order_id,
      status: order.status,
      paymentStatus: order.payment_status,
      packageLabel: order.package_label,
      amount: order.amount,
      practiceName: order.practice_name,
      ownerName: order.owner_name,
      email: order.email,
      whatsapp: order.whatsapp,
      deviceFingerprint: order.device_fingerprint,
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
