const { json, methodNotAllowed, readJson, requireEnv } = require("../../server/sales-config");
const { fulfillOrder } = require("../../server/fulfillment");
const { findOrderByOrderId } = require("../../server/supabase-rest");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const input = await readJson(req);
    if (String(input.adminToken || "") !== requireEnv("ORDER_ADMIN_TOKEN")) {
      return json(res, 401, { error: "unauthorized" });
    }
    const orderId = String(input.orderId || "").trim();
    const order = await findOrderByOrderId(orderId);
    if (!order) return json(res, 404, { error: "order_not_found" });
    if (!order.device_fingerprint) return json(res, 400, { error: "fingerprint_required" });
    const result = await fulfillOrder(order, "admin", { force: true });
    return json(res, 200, {
      ok: true,
      created: result.created,
      emailSent: result.emailSent,
      licenseId: result.license ? result.license.license_id : null,
    });
  } catch (error) {
    return json(res, 500, { error: "approve_license_failed", message: error.message });
  }
};
