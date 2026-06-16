const { json, methodNotAllowed, requireEnv } = require("../../server/sales-config");
const { supabaseFetch } = require("../../server/supabase-rest");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);

  try {
    const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    if (url.searchParams.get("token") !== requireEnv("ORDER_ADMIN_TOKEN")) {
      return json(res, 401, { error: "unauthorized" });
    }
    const data = await supabaseFetch(
      "orders?select=order_id,status,payment_status,package_label,amount,practice_name,owner_name,email,whatsapp,device_fingerprint,license_id,created_at,updated_at&order=created_at.desc&limit=50",
    );
    return json(res, 200, { orders: data });
  } catch (error) {
    return json(res, 500, { error: "admin_orders_failed", message: error.message });
  }
};
