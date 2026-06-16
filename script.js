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

const WHATSAPP_NUMBER = "6283896985999";
const WHATSAPP_MESSAGE =
  "Halo, saya ingin melihat video demo singkat atau jadwal demo live 15 menit MedPraktik dengan data dummy. Saya ingin dibantu pilih paket.";

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
    const packageKey = button.dataset.package;
    if (!orderForm || !packageKey) return;

    orderForm.elements.packageKey.value = packageKey;
    orderForm.elements.requestType.value = packageKey.startsWith("upgrade")
      ? "upgrade"
      : "new_license";
  });
});

if (orderForm) {
  orderForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setOrderMessage("Membuat order...", "info");

    const payload = Object.fromEntries(new FormData(orderForm).entries());
    try {
      const data = await postJson("/api/create-order", payload);
      if (data.accessToken) {
        setCurrentToken(data.accessToken);
        fillStatusToken(data.accessToken);
      }
      if (data.redirectUrl) {
        setOrderMessage("Order dibuat. Mengarahkan ke halaman pembayaran Midtrans...", "success");
        window.location.href = data.redirectUrl;
        return;
      }
      setOrderMessage(`Request dibuat. Order ID: ${data.orderId}. Cek status di bawah.`, "success");
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
  const licenseHtml = data.license
    ? `<p><strong>License ID:</strong> ${escapeHtml(data.license.licenseId)}</p>
       <p><strong>License key:</strong></p>
       <code class="license-key-box">${escapeHtml(data.license.licenseKey)}</code>`
    : "<p><strong>License:</strong> Belum dibuat. Isi fingerprint atau tunggu review admin.</p>";

  setStatusHtml(`
    <p><strong>Order ID:</strong> ${escapeHtml(data.orderId)}</p>
    <p><strong>Paket:</strong> ${escapeHtml(data.packageLabel)} (${amount})</p>
    <p><strong>Status:</strong> ${escapeHtml(data.status)}</p>
    <p><strong>Payment:</strong> ${escapeHtml(data.paymentStatus)}</p>
    <p><strong>Praktik:</strong> ${escapeHtml(data.practiceName)}</p>
    <p><strong>Fingerprint:</strong> ${escapeHtml(data.deviceFingerprint || "belum diisi")}</p>
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

function setCurrentToken(token) {
  sessionStorage.setItem("medpraktikOrderToken", token);
}

function getCurrentToken() {
  return sessionStorage.getItem("medpraktikOrderToken") || "";
}

function setOrderMessage(message, type) {
  if (!orderMessage) return;
  orderMessage.textContent = message;
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
