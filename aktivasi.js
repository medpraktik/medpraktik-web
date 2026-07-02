const config = window.MEDPRAKTIK_CONFIG || {};
const apiUrl = config.activationApiUrl || "";
const whatsappNumber = config.whatsappNumber || "6283896985999";
const codeEl = document.querySelector("[data-activation-code]");
const copyButton = document.querySelector("[data-copy-code]");
const messageEl = document.querySelector("[data-activation-message]");
const statusEl = document.querySelector("[data-activation-status]");
const form = document.querySelector("[data-activation-form]");
const whatsappButton = document.querySelector("[data-whatsapp-send]");
const downloadButton = document.querySelector("[data-download-installer]");

const query = new URLSearchParams(window.location.search);
const queryCode = query.get("kode");
let activationCode = queryCode || localStorage.getItem("medpraktikActivationCode") || "";

init();

async function init() {
  if (!apiUrl) {
    setMessage("Activation API belum dikonfigurasi.", "error");
    return;
  }

  const packageKey = query.get("paket") || "basic";
  if (!activationCode) {
    const data = await callApi({ action: "init", packageKey });
    activationCode = data.activation.activationCode;
    localStorage.setItem("medpraktikActivationCode", activationCode);
    updateUrlCode(activationCode);
  } else {
    localStorage.setItem("medpraktikActivationCode", activationCode);
  }

  renderCode();
  applyPackageFromQuery(packageKey);
  await loadStatus();
}

copyButton?.addEventListener("click", async () => {
  if (!activationCode) return;
  await navigator.clipboard.writeText(activationCode);
  setMessage("Kode aktivasi sudah dicopy. Simpan kode ini.", "success");
});

downloadButton?.addEventListener("click", async () => {
  if (!activationCode) return;
  setMessage("Membuat link download installer...", "info");
  try {
    const data = await callApi({ action: "download-installer", activationCode });
    if (!data.signedUrl) throw new Error("Link download belum tersedia.");
    window.location.href = data.signedUrl;
    setMessage("Download dimulai. Jika tidak berjalan, hubungi WhatsApp MedPraktik.", "success");
  } catch (error) {
    setMessage(error.message || "Gagal membuat link installer.", "error");
  }
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activationCode) return;

  setMessage("Menyimpan data aktivasi...", "info");
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    const data = await callApi({ action: "submit", activationCode, ...payload });
    renderStatus(data.activation);
    const whatsappUrl = buildWhatsappUrl(data.activation, payload);
    whatsappButton.href = whatsappUrl;
    whatsappButton.hidden = false;
    setMessage("Data tersimpan. Klik tombol WhatsApp untuk mengirim data ke penjual.", "success");
  } catch (error) {
    setMessage(error.message || "Gagal menyimpan data aktivasi.", "error");
  }
});

async function loadStatus() {
  if (!activationCode) return;
  try {
    const data = await callApi({ action: "status", activationCode });
    renderStatus(data.activation);
  } catch (error) {
    statusEl.innerHTML = `<p>${escapeHtml(error.message || "Status belum tersedia.")}</p>`;
  }
}

function renderCode() {
  codeEl.textContent = activationCode || "-";
}

function renderStatus(activation) {
  if (!activation) return;
  const licenseHtml = activation.licenseKey
    ? `<div class="license-ready">
        <p><strong>License key sudah tersedia:</strong></p>
        <code class="license-key-box">${escapeHtml(activation.licenseKey)}</code>
        <p>Copy license key ini ke layar Aktivasi/Lisensi MedPraktik.</p>
      </div>`
    : `<p><strong>License:</strong> belum dibuat. Penjual akan membuat license setelah pembayaran dan fingerprint diverifikasi.</p>`;

  statusEl.innerHTML = `
    <p><strong>Status:</strong> ${escapeHtml(activation.statusLabel || activation.activationStatus || "-")}</p>
    <p><strong>Paket:</strong> ${escapeHtml(activation.packageLabel || "-")}</p>
    <p><strong>Pembayaran:</strong> ${escapeHtml(paymentLabel(activation.paymentStatus))}</p>
    <p><strong>Fingerprint:</strong> ${activation.deviceFingerprint ? "sudah diterima" : "belum diisi"}</p>
    ${licenseHtml}
    ${activation.adminNotes ? `<p><strong>Catatan admin:</strong> ${escapeHtml(activation.adminNotes)}</p>` : ""}
  `;
}

function buildWhatsappUrl(activation, payload) {
  const lines = [
    "Halo MedPraktik, saya sudah mengirim data aktivasi.",
    "",
    `Kode aktivasi: ${activationCode}`,
    `Nama: ${payload.buyerName || activation.buyerName || "-"}`,
    `Praktik/Klinik: ${payload.practiceName || activation.practiceName || "-"}`,
    `WhatsApp: ${payload.whatsapp || activation.whatsapp || "-"}`,
    `Email: ${payload.email || activation.email || "-"}`,
    `Paket: ${packageLabel(payload.packageKey || activation.packageKey)}`,
    `Order/Payment ID Midtrans: ${payload.midtransPaymentId || activation.midtransPaymentId || "-"}`,
    `Fingerprint: ${payload.deviceFingerprint || activation.deviceFingerprint || "-"}`,
    "",
    `Catatan: ${payload.buyerNotes || "-"}`,
  ];
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(lines.join("\n"))}`;
}

async function callApi(payload) {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || "Request gagal.");
  return data;
}

function applyPackageFromQuery(packageKey) {
  if (!form?.elements.packageKey) return;
  const exists = [...form.elements.packageKey.options].some((option) => option.value === packageKey);
  if (exists) form.elements.packageKey.value = packageKey;
}

function updateUrlCode(code) {
  const url = new URL(window.location.href);
  url.searchParams.set("kode", code);
  window.history.replaceState({}, "", url);
}

function setMessage(message, type = "info") {
  if (!messageEl) return;
  messageEl.textContent = message;
  messageEl.dataset.type = type;
}

function paymentLabel(value) {
  const labels = {
    not_required: "Tidak perlu pembayaran",
    menunggu_verifikasi: "Menunggu verifikasi admin",
    pembayaran_valid: "Pembayaran valid",
    pending: "Pending",
    cancelled: "Dibatalkan",
  };
  return labels[value] || value || "-";
}

function packageLabel(value) {
  const labels = {
    trial: "Trial",
    basic: "Basic",
    basic_plus: "Basic Plus",
    upgrade_basic_to_basic_plus: "Upgrade Basic ke Basic Plus",
    advanced: "Advanced",
    pro: "Pro / Pengembangan Lanjutan",
  };
  return labels[value] || value || "-";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
