const crypto = require("crypto");

function dateString(date) {
  return date.toISOString().replace(/\.\d+Z$/, "Z");
}

function normalizeFingerprint(value) {
  return String(value || "").trim().toLowerCase();
}

function payloadSignature(payload, secret) {
  const parts = [
    payload.deviceFingerprint || "",
    payload.licensedTo || "",
    payload.licenseType || "",
    payload.issuedAt || "",
    payload.maintenanceUntil || "",
  ];
  if (Object.prototype.hasOwnProperty.call(payload, "expiresAt")) {
    parts.push(payload.expiresAt || "");
  }
  return crypto
    .createHmac("sha256", secret)
    .update(parts.join("|"))
    .digest("hex")
    .toUpperCase();
}

function licenseId(licenseKey) {
  return crypto.createHash("sha256").update(licenseKey.trim()).digest("hex").slice(0, 10).toUpperCase();
}

function generateLicensePayload({
  deviceFingerprint,
  licensedTo,
  licenseType,
  maintenanceUntil,
  expiresAt,
  secret,
}) {
  if (!secret || !secret.trim()) throw new Error("License secret is empty.");
  const payload = {
    deviceFingerprint: normalizeFingerprint(deviceFingerprint),
    licensedTo: String(licensedTo || "").trim(),
    licenseType: String(licenseType || "pilot").trim() || "pilot",
    issuedAt: dateString(new Date()),
    maintenanceUntil: maintenanceUntil ? dateString(new Date(maintenanceUntil)) : null,
    expiresAt: expiresAt ? dateString(new Date(expiresAt)) : null,
  };
  payload.signature = payloadSignature(payload, secret);
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `ERM2-${encoded}`;
}

function trialExpiresAt(days = 14) {
  const now = new Date();
  const utcStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  utcStart.setUTCDate(utcStart.getUTCDate() + days - 1);
  utcStart.setUTCHours(23, 59, 59, 0);
  return utcStart;
}

module.exports = {
  generateLicensePayload,
  licenseId,
  trialExpiresAt,
};
