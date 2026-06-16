const { json, methodNotAllowed, normalizeFingerprint, readJson } = require("../server/sales-config");
const { fulfillOrder } = require("../server/fulfillment");
const { findOrderByAccessToken, updateRows } = require("../server/supabase-rest");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const input = await readJson(req);
    const token = String(input.accessToken || "").trim();
    const fingerprint = normalizeFingerprint(input.deviceFingerprint);
    if (token.length < 20) return json(res, 400, { error: "Token order tidak valid." });
    if (fingerprint.length < 8 || fingerprint.length > 200) {
      return json(res, 400, { error: "Fingerprint perangkat tidak valid." });
    }

    const order = await findOrderByAccessToken(token);
    if (!order) return json(res, 404, { error: "Order tidak ditemukan." });
    if (order.device_fingerprint && order.device_fingerprint !== fingerprint) {
      return json(res, 409, { error: "Fingerprint order sudah berbeda. Hubungi support." });
    }

    const paid = ["not_required", "settlement", "capture"].includes(order.payment_status);
    const nextStatus = paid ? "paid" : order.status;
    const updated = await updateRows("orders", `order_id=eq.${encodeURIComponent(order.order_id)}`, {
      device_fingerprint: fingerprint,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    });
    const updatedOrder = updated[0] || order;
    if (paid) await fulfillOrder(updatedOrder, "submit_fingerprint");

    return json(res, 200, { ok: true });
  } catch (error) {
    return json(res, 500, { error: "submit_fingerprint_failed", message: error.message });
  }
};
