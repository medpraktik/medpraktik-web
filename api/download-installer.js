const { json, methodNotAllowed } = require("../server/sales-config");
const { createInstallerSignedUrl } = require("../server/installer-storage");
const { findOrderByAccessToken } = require("../server/supabase-rest");

const BLOCKED_STATUSES = new Set(["cancelled", "expired"]);

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);

  try {
    const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const token = String(url.searchParams.get("order") || "").trim();
    if (token.length < 20) return json(res, 400, { error: "Kode status order tidak valid." });

    const order = await findOrderByAccessToken(token);
    if (!order) return json(res, 404, { error: "Order tidak ditemukan." });
    if (BLOCKED_STATUSES.has(order.status)) {
      return json(res, 403, { error: "Order tidak aktif. Hubungi support MedPraktik." });
    }

    const signedUrl = await createInstallerSignedUrl();
    res.statusCode = 302;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Location", signedUrl);
    res.end();
  } catch (error) {
    return json(res, 500, { error: "download_installer_failed", message: error.message });
  }
};
