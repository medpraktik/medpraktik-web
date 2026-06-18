const {
  json,
  methodNotAllowed,
  readJson,
} = require("../server/sales-config");
const { verifySignature } = require("../server/midtrans");
const { applyPaymentNotification } = require("../server/payment-sync");
const { findOrderByOrderId, insertRow } = require("../server/supabase-rest");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const notification = await readJson(req);
    if (!verifySignature(notification)) {
      return json(res, 401, { error: "invalid_signature" });
    }

    const order = await findOrderByOrderId(notification.order_id);
    if (!order) return json(res, 404, { error: "order_not_found" });

    await insertRow("payment_events", {
      order_id: order.order_id,
      transaction_id: notification.transaction_id || null,
      transaction_status: notification.transaction_status || null,
      fraud_status: notification.fraud_status || null,
      payment_type: notification.payment_type || null,
      gross_amount: notification.gross_amount || null,
      signature_verified: true,
      raw_event: notification,
    });

    await applyPaymentNotification(order, notification, "midtrans_webhook");

    return json(res, 200, { ok: true });
  } catch (error) {
    return json(res, 500, { error: "webhook_failed", message: error.message });
  }
};
