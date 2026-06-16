const crypto = require("crypto");
const { requireEnv, siteUrl } = require("./sales-config");

function midtransBase() {
  return process.env.MIDTRANS_ENV === "production"
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";
}

function authHeader() {
  return `Basic ${Buffer.from(`${requireEnv("MIDTRANS_SERVER_KEY")}:`).toString("base64")}`;
}

async function createSnapTransaction(order) {
  const payload = {
    transaction_details: {
      order_id: order.order_id,
      gross_amount: order.amount,
    },
    customer_details: {
      first_name: order.owner_name,
      email: order.email,
      phone: order.whatsapp,
    },
    item_details: [
      {
        id: order.package_key,
        price: order.amount,
        quantity: 1,
        name: `MedPraktik ${order.package_label}`,
      },
    ],
    callbacks: {
      finish: `${siteUrl()}/?order=${encodeURIComponent(order.access_token)}#status-order`,
    },
  };

  const response = await fetch(`${midtransBase()}/snap/v1/transactions`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_messages ? data.error_messages.join("; ") : "Midtrans Snap error");
  }
  return data;
}

function verifySignature(notification) {
  const source = `${notification.order_id}${notification.status_code}${notification.gross_amount}${requireEnv("MIDTRANS_SERVER_KEY")}`;
  const expected = crypto.createHash("sha512").update(source).digest("hex");
  return expected === notification.signature_key;
}

module.exports = {
  createSnapTransaction,
  verifySignature,
};
