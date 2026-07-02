type JsonMap = Record<string, unknown>;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-operator-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PACKAGE_CATALOG: Record<string, { label: string; amount: number; licenseType: string }> = {
  trial: { label: "Trial", amount: 0, licenseType: "trial" },
  basic: { label: "Basic", amount: 3500000, licenseType: "basic" },
  basic_plus: { label: "Basic Plus", amount: 6500000, licenseType: "basic_plus" },
  upgrade_basic_to_basic_plus: {
    label: "Upgrade Basic ke Basic Plus",
    amount: 3300000,
    licenseType: "basic_plus",
  },
  advanced: { label: "Advanced", amount: 0, licenseType: "advance_server" },
  pro: { label: "Pro / Pengembangan Lanjutan", amount: 0, licenseType: "pro" },
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Kode aktivasi dibuat",
  data_diterima: "Data aktivasi diterima",
  menunggu_verifikasi_pembayaran: "Menunggu verifikasi pembayaran",
  pembayaran_valid: "Pembayaran valid",
  menunggu_fingerprint: "Menunggu fingerprint perangkat",
  siap_generate_license: "Siap dibuatkan license",
  license_dibuat: "License key sudah dibuat",
  license_dikirim: "License key sudah dikirim",
  selesai: "Selesai",
  perlu_perbaikan_data: "Perlu perbaikan data",
  dibatalkan: "Dibatalkan",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const input = await req.json().catch(() => ({}));
    const action = String(input.action || "").trim();

    if (action === "init") return await initActivation(input);
    if (action === "submit") return await submitActivation(input);
    if (action === "status") return await activationStatus(input);
    if (action === "download-installer") return await downloadInstaller(input);

    if (action.startsWith("operator-")) {
      assertOperator(req);
      if (action === "operator-list") return await operatorList(input);
      if (action === "operator-update") return await operatorUpdate(input);
      if (action === "operator-generate-license") return await operatorGenerateLicense(input);
      if (action === "operator-mark-license-sent") return await operatorMarkLicenseSent(input);
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    const status = message === "unauthorized" ? 401 : 500;
    return json({ error: message }, status);
  }
});

async function initActivation(input: JsonMap) {
  const packageKey = normalizePackage(input.packageKey);
  const code = makeActivationCode();
  const pkg = PACKAGE_CATALOG[packageKey];
  const row = await insertRow("activation_requests", {
    activation_code: code,
    package_key: packageKey,
    package_label: pkg.label,
    activation_status: "draft",
    payment_status: packageKey === "trial" ? "not_required" : "menunggu_verifikasi",
    source: "cloudflare_payment_link",
  });
  await addEvent(code, "buyer", "activation_initialized", { package_key: packageKey });
  return json({ activation: publicActivation(row) });
}

async function submitActivation(input: JsonMap) {
  const code = normalizeCode(input.activationCode);
  const existing = await findByCode(code);
  if (!existing) return json({ error: "activation_not_found" }, 404);

  const buyerName = cleanText(input.buyerName, 120);
  const practiceName = cleanText(input.practiceName, 160);
  const whatsapp = normalizePhone(input.whatsapp);
  const email = normalizeEmail(input.email);
  const midtransPaymentId = cleanText(input.midtransPaymentId, 120);
  const deviceFingerprint = normalizeFingerprint(input.deviceFingerprint);
  const buyerNotes = cleanText(input.buyerNotes, 1000);
  const packageKey = normalizePackage(input.packageKey || existing.package_key);
  const pkg = PACKAGE_CATALOG[packageKey];

  if (buyerName.length < 2) return json({ error: "Nama pembeli wajib diisi." }, 400);
  if (practiceName.length < 2) return json({ error: "Nama praktik/klinik wajib diisi." }, 400);
  if (!isValidEmail(email)) return json({ error: "Email tidak valid." }, 400);
  if (whatsapp.length < 10) return json({ error: "Nomor WhatsApp tidak valid." }, 400);
  if (deviceFingerprint.length < 8 || deviceFingerprint.length > 220) {
    return json({ error: "Fingerprint perangkat tidak valid." }, 400);
  }

  const activationStatus = existing.payment_status === "pembayaran_valid"
    ? "siap_generate_license"
    : "menunggu_verifikasi_pembayaran";

  const row = await updateByCode(code, {
    package_key: packageKey,
    package_label: pkg.label,
    buyer_name: buyerName,
    practice_name: practiceName,
    whatsapp,
    email,
    midtrans_payment_id: midtransPaymentId,
    device_fingerprint: deviceFingerprint,
    buyer_notes: buyerNotes,
    activation_status: activationStatus,
    updated_at: new Date().toISOString(),
  });
  await addEvent(code, "buyer", "activation_submitted", { package_key: packageKey });
  return json({ activation: publicActivation(row) });
}

async function activationStatus(input: JsonMap) {
  const code = normalizeCode(input.activationCode);
  const row = await findByCode(code);
  if (!row) return json({ error: "activation_not_found" }, 404);
  return json({ activation: publicActivation(row) });
}

async function downloadInstaller(input: JsonMap) {
  const code = normalizeCode(input.activationCode);
  const row = await findByCode(code);
  if (!row) return json({ error: "activation_not_found" }, 404);
  if (["dibatalkan"].includes(String(row.activation_status))) {
    return json({ error: "activation_inactive" }, 403);
  }
  const signedUrl = await createInstallerSignedUrl();
  await addEvent(code, "buyer", "installer_link_requested", {});
  return json({ signedUrl });
}

async function operatorList(input: JsonMap) {
  const limit = Math.min(Number(input.limit) || 50, 100);
  const status = cleanText(input.status, 80);
  let path =
    "activation_requests?select=*&order=created_at.desc&limit=" + encodeURIComponent(String(limit));
  if (status) path += "&activation_status=eq." + encodeURIComponent(status);
  const rows = await supabaseFetch(path);
  return json({ requests: rows });
}

async function operatorUpdate(input: JsonMap) {
  const code = normalizeCode(input.activationCode);
  const row = await findByCode(code);
  if (!row) return json({ error: "activation_not_found" }, 404);

  const patch: JsonMap = { updated_at: new Date().toISOString() };
  if (input.activationStatus) patch.activation_status = cleanText(input.activationStatus, 80);
  if (input.paymentStatus) patch.payment_status = cleanText(input.paymentStatus, 80);
  if (input.adminNotes !== undefined) patch.admin_notes = cleanText(input.adminNotes, 2000);
  if (input.midtransPaymentId !== undefined) {
    patch.midtrans_payment_id = cleanText(input.midtransPaymentId, 120);
  }

  const updated = await updateByCode(code, patch);
  await addEvent(code, "operator", "operator_updated", patch);
  return json({ activation: operatorActivation(updated) });
}

async function operatorGenerateLicense(input: JsonMap) {
  const code = normalizeCode(input.activationCode);
  const row = await findByCode(code);
  if (!row) return json({ error: "activation_not_found" }, 404);
  if (!row.device_fingerprint) return json({ error: "fingerprint_required" }, 400);
  if (!["pembayaran_valid", "not_required"].includes(String(row.payment_status))) {
    return json({ error: "payment_not_validated" }, 400);
  }

  const packageKey = normalizePackage(row.package_key);
  const pkg = PACKAGE_CATALOG[packageKey];
  const expiresAt = packageKey === "trial" ? trialExpiresAt(14) : null;
  const licenseKey = await generateLicensePayload({
    deviceFingerprint: String(row.device_fingerprint),
    licensedTo: String(row.practice_name || row.buyer_name || "MedPraktik"),
    licenseType: pkg.licenseType,
    expiresAt,
    secret: requireEnv("ERM_LICENSE_SECRET"),
  });
  const id = await licenseId(licenseKey);
  const updated = await updateByCode(code, {
    license_id: id,
    license_type: pkg.licenseType,
    license_key: licenseKey,
    activation_status: "license_dibuat",
    updated_at: new Date().toISOString(),
  });
  await addEvent(code, "operator", "license_generated", { license_id: id });
  return json({ activation: operatorActivation(updated) });
}

async function operatorMarkLicenseSent(input: JsonMap) {
  const code = normalizeCode(input.activationCode);
  const row = await findByCode(code);
  if (!row) return json({ error: "activation_not_found" }, 404);
  const updated = await updateByCode(code, {
    activation_status: "license_dikirim",
    license_sent_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  await addEvent(code, "operator", "license_sent", {});
  return json({ activation: operatorActivation(updated) });
}

function publicActivation(row: JsonMap) {
  const status = String(row.activation_status || "draft");
  return {
    activationCode: row.activation_code,
    packageKey: row.package_key,
    packageLabel: row.package_label,
    buyerName: row.buyer_name,
    practiceName: row.practice_name,
    whatsapp: row.whatsapp,
    email: row.email,
    midtransPaymentId: row.midtrans_payment_id,
    deviceFingerprint: row.device_fingerprint,
    paymentStatus: row.payment_status,
    activationStatus: status,
    statusLabel: STATUS_LABELS[status] || status,
    licenseId: row.license_id,
    licenseType: row.license_type,
    licenseKey: canShowLicense(status) ? row.license_key : null,
    adminNotes: row.admin_notes,
    licenseSentAt: row.license_sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function operatorActivation(row: JsonMap) {
  return {
    ...publicActivation(row),
    licenseKey: row.license_key || null,
    buyerNotes: row.buyer_notes,
    adminNotes: row.admin_notes,
  };
}

function canShowLicense(status: string) {
  return ["license_dibuat", "license_dikirim", "selesai"].includes(status);
}

async function findByCode(code: string): Promise<JsonMap | null> {
  const rows = await supabaseFetch(
    "activation_requests?select=*&activation_code=eq." + encodeURIComponent(code) + "&limit=1",
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function insertRow(table: string, payload: JsonMap) {
  const rows = await supabaseFetch(table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  return rows[0];
}

async function updateByCode(code: string, payload: JsonMap) {
  const rows = await supabaseFetch(
    "activation_requests?activation_code=eq." + encodeURIComponent(code),
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    },
  );
  return rows[0];
}

async function addEvent(code: string, actor: string, action: string, metadata: JsonMap) {
  await insertRow("activation_events", {
    activation_code: code,
    actor,
    action,
    metadata,
  });
}

async function supabaseFetch(path: string, init: RequestInit = {}) {
  const baseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || response.statusText);
  }
  return data;
}

async function createInstallerSignedUrl() {
  const baseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const bucket = optionalEnv("INSTALLER_BUCKET") || "medpraktik-installers";
  const objectPath = optionalEnv("INSTALLER_OBJECT_PATH") || "v1.1.0/MedPraktik-v1.1.0-Setup.exe";
  const expiresIn = Number(optionalEnv("INSTALLER_LINK_EXPIRES_SECONDS")) || 3600;
  const response = await fetch(
    `${baseUrl}/storage/v1/object/sign/${bucket}/${encodeURI(objectPath)}`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn }),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || response.statusText);
  const signedPath = data.signedURL || data.signedUrl || data.signed_url;
  if (!signedPath) throw new Error("installer_signed_url_missing");
  return signedPath.startsWith("http") ? signedPath : `${baseUrl}/storage/v1${signedPath}`;
}

async function generateLicensePayload(input: {
  deviceFingerprint: string;
  licensedTo: string;
  licenseType: string;
  expiresAt: Date | null;
  secret: string;
}) {
  const payload: JsonMap = {
    deviceFingerprint: normalizeFingerprint(input.deviceFingerprint),
    licensedTo: cleanText(input.licensedTo, 180),
    licenseType: cleanText(input.licenseType, 80) || "pilot",
    issuedAt: dateString(new Date()),
    maintenanceUntil: null,
    expiresAt: input.expiresAt ? dateString(input.expiresAt) : null,
  };
  payload.signature = await payloadSignature(payload, input.secret);
  return `ERM2-${base64UrlEncode(JSON.stringify(payload))}`;
}

async function payloadSignature(payload: JsonMap, secret: string) {
  const parts = [
    payload.deviceFingerprint || "",
    payload.licensedTo || "",
    payload.licenseType || "",
    payload.issuedAt || "",
    payload.maintenanceUntil || "",
  ];
  if (Object.prototype.hasOwnProperty.call(payload, "expiresAt")) parts.push(payload.expiresAt || "");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(parts.join("|")));
  return hex(new Uint8Array(signature)).toUpperCase();
}

async function licenseId(licenseKey: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(licenseKey.trim()));
  return hex(new Uint8Array(digest)).slice(0, 10).toUpperCase();
}

function trialExpiresAt(days: number) {
  const now = new Date();
  const utcStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  utcStart.setUTCDate(utcStart.getUTCDate() + days - 1);
  utcStart.setUTCHours(23, 59, 59, 0);
  return utcStart;
}

function base64UrlEncode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function hex(bytes: Uint8Array) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function makeActivationCode() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `MPA-${hex(bytes).toUpperCase()}`;
}

function normalizeCode(value: unknown) {
  const code = cleanText(value, 120).toUpperCase();
  if (!/^MPA-[A-F0-9]{48}$/.test(code)) throw new Error("activation_code_invalid");
  return code;
}

function normalizePackage(value: unknown) {
  const key = cleanText(value, 80) || "basic";
  if (!PACKAGE_CATALOG[key]) throw new Error("package_invalid");
  return key;
}

function cleanText(value: unknown, max = 300) {
  return String(value || "").trim().slice(0, max);
}

function normalizeEmail(value: unknown) {
  return cleanText(value, 180).toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizePhone(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

function normalizeFingerprint(value: unknown) {
  return cleanText(value, 220).toLowerCase();
}

function dateString(date: Date) {
  return date.toISOString().replace(/\.\d+Z$/, "Z");
}

function assertOperator(req: Request) {
  const expected = requireEnv("OPERATOR_ADMIN_TOKEN");
  const token = req.headers.get("x-operator-token") || "";
  if (!token || token !== expected) throw new Error("unauthorized");
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value || !value.trim()) throw new Error(`missing_env_${name}`);
  return value.trim();
}

function optionalEnv(name: string) {
  const value = Deno.env.get(name);
  return value && value.trim() ? value.trim() : "";
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
