const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");
const header = document.querySelector("[data-header]");
const galleryButtons = document.querySelectorAll("[data-shot]");
const galleryImage = document.querySelector("[data-gallery-shot]");
const whatsappLinks = document.querySelectorAll(".js-whatsapp-link");

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
