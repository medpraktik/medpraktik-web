const {
  assertBuyerInput,
  json,
  makeAccessToken,
  makeOrderId,
  methodNotAllowed,
  readJson,
} = require("../server/sales-config");
const { createSnapTransaction } = require("../server/midtrans");
const { fulfillOrder } = require("../server/fulfillment");
const { insertRow, updateRows } = require("../server/supabase-rest");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const input = await readJson(req);
    const parsed = assertBuyerInput(input);
    if (parsed.error) return json(res, 400, { error: parsed.error });

    const buyer = parsed.value;
    const order = await insertRow("orders", {
      order_id: makeOrderId(),
      access_token: makeAccessToken(),
      request_type: buyer.requestType,
      package_key: buyer.packageKey,
      package_label: buyer.packageInfo.label,
      amount: buyer.packageInfo.amount,
      status: buyer.packageInfo.paid
        ? "pending_payment"
        : buyer.packageKey === "trial"
          ? "waiting_fingerprint"
          : "needs_admin_review",
      payment_status: buyer.packageInfo.paid ? "pending" : "not_required",
      practice_name: buyer.practiceName,
      owner_name: buyer.ownerName,
      email: buyer.email,
      whatsapp: buyer.whatsapp,
      device_fingerprint: buyer.deviceFingerprint || null,
      notes: buyer.notes,
    });

    await insertRow("audit_logs", {
      order_id: order.order_id,
      actor: "customer",
      action: "order_created",
      metadata: { package_key: order.package_key, request_type: order.request_type },
    });

    if (!buyer.packageInfo.paid) {
      if (order.device_fingerprint && buyer.packageKey === "trial") {
        await fulfillOrder(order, "system");
      }
      return json(res, 201, {
        orderId: order.order_id,
        status: order.status,
        accessToken: order.access_token,
        statusUrl: `/?order=${encodeURIComponent(order.access_token)}#status-order`,
      });
    }

    const snap = await createSnapTransaction(order);
    await updateRows("orders", `order_id=eq.${encodeURIComponent(order.order_id)}`, {
      midtrans_token: snap.token,
      midtrans_redirect_url: snap.redirect_url,
      updated_at: new Date().toISOString(),
    });

    return json(res, 201, {
      orderId: order.order_id,
      status: "pending_payment",
      accessToken: order.access_token,
      snapToken: snap.token,
      redirectUrl: snap.redirect_url,
      statusUrl: `/?order=${encodeURIComponent(order.access_token)}#status-order`,
    });
  } catch (error) {
    return json(res, 500, { error: "create_order_failed", message: error.message });
  }
};
