const { FAILED_STATUSES, PACKAGE_CATALOG } = require("./sales-config");
const { fulfillOrder } = require("./fulfillment");
const { getTransactionStatus } = require("./midtrans");
const { findOrderByOrderId, updateRows } = require("./supabase-rest");

const FULFILLMENT_STATUSES = new Set(["license_generated", "fulfilled"]);
const PAID_MIDTRANS_STATUSES = new Set(["settlement"]);
const SYNCABLE_PAYMENT_STATUSES = new Set(["pending"]);

function isPaidNotification(notification) {
  const txStatus = String(notification.transaction_status || "");
  const fraudStatus = String(notification.fraud_status || "");
  return (
    PAID_MIDTRANS_STATUSES.has(txStatus) ||
    (txStatus === "capture" && (!fraudStatus || fraudStatus === "accept"))
  );
}

function nextOrderStatus(order, notification) {
  const txStatus = String(notification.transaction_status || "");
  if (isPaidNotification(notification) && FULFILLMENT_STATUSES.has(order.status) && order.license_id) {
    return order.status;
  }
  if (isPaidNotification(notification)) {
    return order.device_fingerprint ? "paid" : "waiting_fingerprint";
  }
  if (FAILED_STATUSES.has(txStatus)) {
    return txStatus === "expire" ? "expired" : "cancelled";
  }
  if (txStatus === "capture") {
    return "needs_admin_review";
  }
  return order.status;
}

async function applyPaymentNotification(order, notification, actor) {
  const txStatus = String(notification.transaction_status || "");
  const updated = await updateRows("orders", `order_id=eq.${encodeURIComponent(order.order_id)}`, {
    status: nextOrderStatus(order, notification),
    payment_status: txStatus || order.payment_status,
    midtrans_transaction_id: notification.transaction_id || order.midtrans_transaction_id,
    updated_at: new Date().toISOString(),
  });
  const updatedOrder = updated[0] || order;

  if (isPaidNotification(notification)) {
    await fulfillOrder(updatedOrder, actor);
  }

  return findOrderByOrderId(order.order_id);
}

function shouldSyncWithMidtrans(order) {
  const packageInfo = PACKAGE_CATALOG[order.package_key];
  return Boolean(
    packageInfo &&
      packageInfo.paid &&
      SYNCABLE_PAYMENT_STATUSES.has(order.payment_status) &&
      !FULFILLMENT_STATUSES.has(order.status),
  );
}

async function syncOrderWithMidtrans(order, actor) {
  if (!shouldSyncWithMidtrans(order)) {
    return { order, synced: false, error: null };
  }

  try {
    const status = await getTransactionStatus(order.order_id);
    const updatedOrder = await applyPaymentNotification(order, status, actor);
    return { order: updatedOrder || order, synced: true, error: null };
  } catch (error) {
    return { order, synced: false, error };
  }
}

module.exports = {
  applyPaymentNotification,
  isPaidNotification,
  shouldSyncWithMidtrans,
  syncOrderWithMidtrans,
};
