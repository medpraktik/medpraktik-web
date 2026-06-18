const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");
const header = document.querySelector("[data-header]");
const galleryButtons = document.querySelectorAll("[data-shot]");
const galleryImage = document.querySelector("[data-gallery-shot]");
const whatsappLinks = document.querySelectorAll(".js-whatsapp-link");
const packageButtons = document.querySelectorAll(".js-package-select");
const orderForm = document.querySelector("[data-order-form]");
const orderMessage = document.querySelector("[data-order-message]");
const statusForm = document.querySelector("[data-status-form]");
const statusResult = document.querySelector("[data-status-result]");
const fingerprintForm = document.querySelector("[data-fingerprint-form]");

const ORDER_INTENTS = {
  trial: {
    requestType: "trial",
    packageKey: "trial",
    paymentMessage: "Order trial dibuat. Tim MedPraktik akan mengirim link installer resmi ke WhatsApp/email Anda. Setelah install, kirim fingerprint dari layar Aktivasi/Lisensi.",
  },
  basic: {
    requestType: "new_license",
    packageKey: "basic",
    paymentMessage: "Order Basic dibuat. Lanjutkan pembayaran Midtrans untuk memproses lisensi.",
  },
  basic_plus: {
    requestType: "new_license",
    packageKey: "basic_plus",
    paymentMessage: "Order Basic Plus dibuat. Lanjutkan pembayaran Midtrans untuk memproses lisensi.",
  },
  upgrade_basic_to_basic_plus: {
    requestType: "upgrade",
    packageKey: "upgrade_basic_to_basic_plus",
    paymentMessage: "Request upgrade dibuat. Cek status di bawah untuk langkah berikutnya.",
  },
  advanced: {
    requestType: "consultation",
    packageKey: "advanced",
    paymentMessage: "Request Advanced dibuat. Tim MedPraktik akan review kebutuhan jaringan lokal terlebih dahulu.",
  },
  pro: {
    requestType: "consultation",
    packageKey: "pro",
    paymentMessage: "Request Pro dibuat. Tim MedPraktik akan diskusi scope pengembangan lanjutan terlebih dahulu.",
  },
};

const WHATSAPP_NUMBER = "6283896985999";
const WHATSAPP_MESSAGE =
  "Halo, saya ingin melihat video demo singkat atau jadwal demo live 15 menit MedPraktik dengan data dummy. Saya ingin dibantu pilih paket.";
const INSTALLER_WHATSAPP_MESSAGE =
  "Halo, saya sudah membuat order MedPraktik dan ingin follow up link installer resmi untuk mengambil fingerprint perangkat.";

whatsappLinks.forEach((link) => {
  const message = link.dataset.whatsappMessage || WHATSAPP_MESSAGE;
  const whatsappUrl = WHATSAPP_NUMBER
    ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
    : "#kontak";

  link.setAttribute("href", whatsappUrl);
  if (!WHATSAPP_NUMBER) {
    link.setAttribute("aria-label", "Minta demo MedPraktik. Nomor WhatsApp belum dipasang.");
  } else {
    link.setAttribute("aria-label", "Hubungi WhatsApp MedPraktik untuk demo, paket, pembayaran, dan instalasi.");
  }
});

if (navToggle && nav) {
  navToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  nav.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      nav.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    }
  });
}

if (header) {
  window.addEventListener(
    "scroll",
    () => header.classList.toggle("has-shadow", window.scrollY > 8),
    { passive: true }
  );
}

galleryButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const src = button.getAttribute("data-shot");
    const label = button.textContent.trim();
    if (!src || !galleryImage) return;

    galleryImage.setAttribute("src", src);
    galleryImage.setAttribute("alt", `Screenshot ${label} MedPraktik dengan data dummy`);

    galleryButtons.forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
  });
});

packageButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const intent = button.dataset.package;
    if (!orderForm || !intent) return;

    applyOrderIntent(intent);
  });
});

if (orderForm) {
  applyOrderIntent(orderForm.elements.orderIntent.value);

  orderForm.elements.orderIntent.addEventListener("change", () => {
    applyOrderIntent(orderForm.elements.orderIntent.value);
  });

  orderForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setOrderMessage("Membuat order...", "info");

    applyOrderIntent(orderForm.elements.orderIntent.value);
    const payload = Object.fromEntries(new FormData(orderForm).entries());
    try {
      const data = await postJson("/api/create-order", payload);
      if (data.accessToken) {
        setCurrentToken(data.accessToken);
        fillStatusToken(data.accessToken);
      }
      if (data.redirectUrl) {
        setOrderMessage("Order dibuat. Mengarahkan ke halaman pembayaran Midtrans...", "success", data.statusUrl);
        window.location.href = data.redirectUrl;
        return;
      }
      const intent = ORDER_INTENTS[payload.orderIntent] || ORDER_INTENTS[payload.packageKey];
      const message = intent ? intent.paymentMessage : "Request dibuat. Cek status di bawah.";
      setOrderMessage(`${message} Order ID: ${data.orderId}.`, "success", data.statusUrl);
      await loadOrderStatus(data.accessToken);
      document.querySelector("#status-order")?.scrollIntoView({ behavior: "smooth" });
    } catch (error) {
      setOrderMessage(error.message || "Gagal membuat order.", "error");
    }
  });
}

if (statusForm) {
  statusForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = statusForm.elements.accessToken.value.trim();
    if (!token) return;
    setCurrentToken(token);
    await loadOrderStatus(token);
  });
}

if (fingerprintForm) {
  fingerprintForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const accessToken = getCurrentToken();
    const deviceFingerprint = fingerprintForm.elements.deviceFingerprint.value.trim();
    if (!accessToken || !deviceFingerprint) return;

    setStatusHtml("<p>Menyimpan fingerprint...</p>");
    try {
      await postJson("/api/submit-fingerprint", { accessToken, deviceFingerprint });
      setStatusHtml("<p>Fingerprint tersimpan. Memuat status dan license key...</p>");
      await loadOrderStatus(accessToken);
    } catch (error) {
      setStatusHtml(`<p>${escapeHtml(error.message || "Gagal menyimpan fingerprint.")}</p>`);
    }
  });
}

const initialToken = new URLSearchParams(window.location.search).get("order");
if (initialToken) {
  setCurrentToken(initialToken);
  fillStatusToken(initialToken);
  loadOrderStatus(initialToken);
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || "Request gagal.");
  }
  return data;
}

async function loadOrderStatus(token) {
  if (!token) return;
  setStatusHtml("<p>Memuat status order...</p>");
  try {
    const response = await fetch(`/api/order-status?token=${encodeURIComponent(token)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Status order tidak ditemukan.");
    renderStatus(data);
  } catch (error) {
    setStatusHtml(`<p>${escapeHtml(error.message || "Gagal memuat status.")}</p>`);
  }
}

function renderStatus(data) {
  const amount = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(data.amount || 0);
  const installerHtml = data.license ? "" : installerDeliveryHtml(data);
  const paymentSyncWarning = data.paymentSyncWarning
    ? `<p><strong>Catatan:</strong> ${escapeHtml(data.paymentSyncWarning)}</p>`
    : "";
  const fingerprintHelp = data.deviceFingerprint
    ? "<p><strong>Fingerprint:</strong> sudah tersimpan.</p>"
    : `<p><strong>Fingerprint:</strong> belum diisi.</p>
       <ol class="status-steps">
         <li>Tunggu link installer resmi dari tim MedPraktik.</li>
         <li>Install aplikasi, buka Aktivasi/Lisensi, lalu copy fingerprint.</li>
         <li>Paste fingerprint di form bawah ini, lalu klik Simpan Fingerprint.</li>
       </ol>`;
  const licenseHtml = renderLicenseBlock(data);

  setStatusHtml(`
    <p><strong>Order ID:</strong> ${escapeHtml(data.orderId)}</p>
    <p><strong>Paket:</strong> ${escapeHtml(data.packageLabel)} (${amount})</p>
    <p><strong>Status:</strong> ${escapeHtml(statusLabel(data.status))}</p>
    <p><strong>Pembayaran:</strong> ${escapeHtml(paymentLabel(data.paymentStatus))}</p>
    <p><strong>Praktik:</strong> ${escapeHtml(data.practiceName)}</p>
    ${installerHtml}
    ${paymentSyncWarning}
    ${fingerprintHelp}
    ${licenseHtml}
  `);

  if (fingerprintForm) {
    fingerprintForm.hidden = Boolean(data.deviceFingerprint && data.license);
  }
}

function fillStatusToken(token) {
  if (statusForm) {
    statusForm.elements.accessToken.value = token;
  }
}

function applyOrderIntent(intent) {
  if (!orderForm) return;
  const option = ORDER_INTENTS[intent];
  if (!option) return;

  orderForm.elements.orderIntent.value = intent;
  orderForm.elements.requestType.value = option.requestType;
  orderForm.elements.packageKey.value = option.packageKey;
}

function installerDeliveryHtml(data) {
  const downloadUrl = installerDownloadUrl();
  const downloadButton = downloadUrl
    ? `<a class="button primary" href="${escapeHtml(downloadUrl)}" target="_blank" rel="noopener">Download installer resmi</a>`
    : "";
  return `<div class="installer-actions">
    <p><strong>Download installer resmi MedPraktik.</strong></p>
    <p>Link memakai kode status order Anda dan diarahkan ke file resmi terbaru.</p>
    ${downloadButton}
    <a class="button secondary" href="${escapeHtml(installerWhatsappUrl(data.orderId))}" target="_blank" rel="noopener">Bantuan installer via WhatsApp</a>
  </div>`;
}

function renderLicenseBlock(data) {
  if (data.license) {
    return `<p><strong>License key sudah dibuat.</strong></p>
      <p><strong>License ID:</strong> ${escapeHtml(data.license.licenseId)}</p>
      <code class="license-key-box">${escapeHtml(data.license.licenseKey)}</code>
      <ol class="status-steps">
        <li>Copy license key ini.</li>
        <li>Buka MedPraktik di laptop Anda.</li>
        <li>Paste ke kolom License key, lalu klik Aktivasi.</li>
      </ol>`;
  }

  if (data.deviceFingerprint && ["pending", "pending_payment"].includes(data.paymentStatus)) {
    return "<p><strong>License:</strong> belum dibuat. Fingerprint sudah tersimpan, tetapi pembayaran belum terkonfirmasi dari Midtrans.</p>";
  }

  if (data.deviceFingerprint) {
    return "<p><strong>License:</strong> belum dibuat. Fingerprint sudah tersimpan dan license sedang diproses.</p>";
  }

  return "<p><strong>License:</strong> belum dibuat. License dibuat setelah pembayaran/review selesai dan fingerprint perangkat tersedia.</p>";
}

function statusLabel(status) {
  const labels = {
    waiting_fingerprint: "Menunggu fingerprint perangkat",
    pending_payment: "Menunggu pembayaran",
    paid: "Pembayaran diterima, memproses license",
    license_generated: "License key sudah dibuat",
    fulfilled: "License key sudah dikirim",
    expired: "Order kedaluwarsa",
    cancelled: "Order dibatalkan",
    manual_review: "Menunggu review admin",
  };
  return labels[status] || status || "-";
}

function paymentLabel(paymentStatus) {
  const labels = {
    not_required: "Tidak perlu pembayaran",
    pending: "Menunggu pembayaran",
    settlement: "Pembayaran diterima",
    capture: "Pembayaran diterima",
    expire: "Pembayaran kedaluwarsa",
    cancel: "Pembayaran dibatalkan",
    deny: "Pembayaran ditolak",
  };
  return labels[paymentStatus] || paymentStatus || "-";
}

function installerWhatsappUrl(orderId) {
  const message = orderId
    ? `${INSTALLER_WHATSAPP_MESSAGE} Order ID: ${orderId}.`
    : INSTALLER_WHATSAPP_MESSAGE;
  return WHATSAPP_NUMBER
    ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
    : "#kontak";
}

function installerDownloadUrl() {
  const token = getCurrentToken();
  return token ? `/api/download-installer?order=${encodeURIComponent(token)}` : "";
}

function setCurrentToken(token) {
  sessionStorage.setItem("medpraktikOrderToken", token);
}

function getCurrentToken() {
  return sessionStorage.getItem("medpraktikOrderToken") || "";
}

function setOrderMessage(message, type, statusUrl) {
  if (!orderMessage) return;
  const safeMessage = escapeHtml(message);
  orderMessage.innerHTML = statusUrl
    ? `${safeMessage} <a href="${escapeHtml(statusUrl)}">Buka link cek status order</a>.`
    : safeMessage;
  orderMessage.classList.toggle("is-error", type === "error");
  orderMessage.classList.toggle("is-success", type === "success");
}

function setStatusHtml(html) {
  if (statusResult) statusResult.innerHTML = html;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
