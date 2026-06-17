const crypto = require("crypto");

const PACKAGE_CATALOG = {
  trial: {
    label: "Trial",
    amount: 0,
    licenseType: "trial",
    paid: false,
    autoFulfill: true,
  },
  basic: {
    label: "Basic",
    amount: 3500000,
    licenseType: "basic",
    paid: true,
    autoFulfill: true,
  },
  basic_plus: {
    label: "Basic Plus",
    amount: 6500000,
    licenseType: "basic_plus",
    paid: true,
    autoFulfill: true,
  },
  upgrade_basic_to_basic_plus: {
    label: "Upgrade Basic ke Basic Plus",
    amount: 3300000,
    licenseType: "basic_plus",
    paid: true,
    autoFulfill: false,
  },
  advanced: {
    label: "Advanced",
    amount: 0,
    licenseType: "advance_server",
    paid: false,
    autoFulfill: false,
  },
  pro: {
    label: "Pro / Pengembangan Lanjutan",
    amount: 0,
    licenseType: "pro",
    paid: false,
    autoFulfill: false,
  },
};

const PAID_STATUSES = new Set(["settlement", "capture"]);
const FAILED_STATUSES = new Set(["deny", "cancel", "expire", "failure"]);

const PACKAGE_REQUEST_TYPES = {
  trial: "trial",
  basic: "new_license",
  basic_plus: "new_license",
  upgrade_basic_to_basic_plus: "upgrade",
  advanced: "consultation",
  pro: "consultation",
};

function json(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function methodNotAllowed(res) {
  json(res, 405, { error: "method_not_allowed" });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("request_too_large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env ${name}`);
  }
  return value.trim();
}

function optionalEnv(name) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : "";
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

function normalizeFingerprint(value) {
  return String(value || "").trim().toLowerCase();
}

function assertBuyerInput(input) {
  const packageKey = String(input.packageKey || "").trim();
  const requestType = String(input.requestType || "new_license").trim();
  const packageInfo = PACKAGE_CATALOG[packageKey];
  if (!packageInfo) {
    return { error: "Paket tidak valid." };
  }
  if (PACKAGE_REQUEST_TYPES[packageKey] !== requestType) {
    return { error: "Jenis request dan paket tidak sesuai. Pilih kebutuhan dari form resmi MedPraktik." };
  }

  const practiceName = String(input.practiceName || "").trim();
  const ownerName = String(input.ownerName || "").trim();
  const email = normalizeEmail(input.email);
  const whatsapp = normalizePhone(input.whatsapp);
  const deviceFingerprint = normalizeFingerprint(input.deviceFingerprint);
  const notes = String(input.notes || "").trim().slice(0, 1000);

  if (practiceName.length < 2) return { error: "Nama praktik wajib diisi." };
  if (ownerName.length < 2) return { error: "Nama owner wajib diisi." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Email tidak valid." };
  if (whatsapp.length < 10) return { error: "Nomor WhatsApp tidak valid." };
  if (deviceFingerprint && (deviceFingerprint.length < 8 || deviceFingerprint.length > 200)) {
    return { error: "Fingerprint perangkat tidak valid." };
  }

  return {
    value: {
      packageKey,
      packageInfo,
      requestType,
      practiceName,
      ownerName,
      email,
      whatsapp,
      deviceFingerprint,
      notes,
    },
  };
}

function makeOrderId() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const token = crypto.randomBytes(5).toString("hex").toUpperCase();
  return `MP-${y}${m}${d}-${token}`;
}

function makeAccessToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function siteUrl() {
  return optionalEnv("PUBLIC_SITE_URL") || "https://medpraktik.com";
}

module.exports = {
  FAILED_STATUSES,
  PACKAGE_CATALOG,
  PAID_STATUSES,
  assertBuyerInput,
  json,
  makeAccessToken,
  makeOrderId,
  methodNotAllowed,
  normalizeFingerprint,
  optionalEnv,
  readJson,
  requireEnv,
  siteUrl,
};
