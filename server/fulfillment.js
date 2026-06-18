const { PACKAGE_CATALOG, requireEnv } = require("./sales-config");
const { generateLicensePayload, licenseId, trialExpiresAt } = require("./license-codec");
const { sendLicenseEmail } = require("./notifications");
const { findLicenseByOrderId, insertRow, updateRows } = require("./supabase-rest");

function canAutoFulfill(order) {
  const info = PACKAGE_CATALOG[order.package_key];
  return Boolean(
    info &&
      info.autoFulfill &&
      order.device_fingerprint &&
      ["trial", "basic", "basic_plus"].includes(order.package_key),
  );
}

async function fulfillOrder(order, actor = "system", options = {}) {
  const existing = await findLicenseByOrderId(order.order_id);
  if (existing) {
    return { license: existing, created: false, emailSent: false };
  }

  if (!options.force && !canAutoFulfill(order)) {
    await updateRows("orders", `order_id=eq.${encodeURIComponent(order.order_id)}`, {
      status: order.device_fingerprint ? "needs_admin_review" : "waiting_fingerprint",
      updated_at: new Date().toISOString(),
    });
    return { license: null, created: false, emailSent: false };
  }

  const info = PACKAGE_CATALOG[order.package_key];
  const expiresAt = order.package_key === "trial" ? trialExpiresAt(14) : null;
  const licenseKey = generateLicensePayload({
    deviceFingerprint: order.device_fingerprint,
    licensedTo: order.practice_name,
    licenseType: info.licenseType,
    expiresAt,
    secret: requireEnv("ERM_LICENSE_SECRET"),
  });
  const id = licenseId(licenseKey);
  const license = await insertRow("licenses", {
    order_id: order.order_id,
    license_id: id,
    package_key: order.package_key,
    license_type: info.licenseType,
    device_fingerprint: order.device_fingerprint,
    licensed_to: order.practice_name,
    license_key: licenseKey,
    expires_at: expiresAt ? expiresAt.toISOString() : null,
    fulfilled_at: new Date().toISOString(),
    fulfilled_by: actor,
  });

  const emailSent = await sendLicenseEmail(order, license);
  await updateRows("orders", `order_id=eq.${encodeURIComponent(order.order_id)}`, {
    status: emailSent ? "fulfilled" : "license_generated",
    license_id: id,
    updated_at: new Date().toISOString(),
  });
  await insertRow("audit_logs", {
    order_id: order.order_id,
    actor,
    action: emailSent ? "license_generated_email_sent" : "license_generated_email_pending",
    metadata: { license_id: id },
  });
  return { license, created: true, emailSent };
}

module.exports = {
  canAutoFulfill,
  fulfillOrder,
};
