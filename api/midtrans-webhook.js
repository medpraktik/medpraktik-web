const {
  FAILED_STATUSES,
  json,
  methodNotAllowed,
  readJson,
} = require("../server/sales-config");
const { fulfillOrder } = require("../server/fulfillment");
const { verifySignature } = require("../server/midtrans");
const { findOrderByOrderId, insertRow, updateRows } = require("../server/supabase-rest");

const FULFILLMENT_STATUSES = new Set(["license_generated", "fulfilled"]);

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

    const txStatus = String(notification.transaction_status || "");
    let nextStatus = order.status;
    const fraudStatus = String(notification.fraud_status || "");
    const isPaid =
      txStatus === "settlement" ||
      (txStatus === "capture" && (!fraudStatus || fraudStatus === "accept"));

    if (isPaid && FULFILLMENT_STATUSES.has(order.status) && order.license_id) {
      nextStatus = order.status;
    } else if (isPaid) {
      nextStatus = order.device_fingerprint ? "paid" : "waiting_fingerprint";
    } else if (FAILED_STATUSES.has(txStatus)) {
      nextStatus = txStatus === "expire" ? "expired" : "cancelled";
    } else if (txStatus === "capture") {
      nextStatus = "needs_admin_review";
    }

    const updated = await updateRows("orders", `order_id=eq.${encodeURIComponent(order.order_id)}`, {
      status: nextStatus,
      payment_status: txStatus || order.payment_status,
      midtrans_transaction_id: notification.transaction_id || order.midtrans_transaction_id,
      updated_at: new Date().toISOString(),
    });
    const updatedOrder = updated[0] || order;

    if (isPaid) {
      await fulfillOrder(updatedOrder, "midtrans_webhook");
    }

    return json(res, 200, { ok: true });
  } catch (error) {
    return json(res, 500, { error: "webhook_failed", message: error.message });
  }
};
