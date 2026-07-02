const config = window.MEDPRAKTIK_CONFIG || {};
const apiUrl = config.activationApiUrl || "";
const tokenForm = document.querySelector("[data-operator-token-form]");
const requestsEl = document.querySelector("[data-operator-requests]");
const statusFilter = document.querySelector("[data-status-filter]");
const refreshButton = document.querySelector("[data-refresh-requests]");

let operatorToken = sessionStorage.getItem("medpraktikOperatorToken") || "";

if (operatorToken && tokenForm) {
  tokenForm.elements.operatorToken.value = operatorToken;
  loadRequests();
}

tokenForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  operatorToken = tokenForm.elements.operatorToken.value.trim();
  sessionStorage.setItem("medpraktikOperatorToken", operatorToken);
  await loadRequests();
});

refreshButton?.addEventListener("click", () => loadRequests());
statusFilter?.addEventListener("change", () => loadRequests());

async function loadRequests() {
  if (!apiUrl) {
    requestsEl.innerHTML = "<p>Activation API belum dikonfigurasi.</p>";
    return;
  }
  if (!operatorToken) return;
  requestsEl.innerHTML = "<p>Memuat request...</p>";
  try {
    const data = await callApi({
      action: "operator-list",
      status: statusFilter?.value || "",
      limit: 80,
    });
    renderRequests(data.requests || []);
  } catch (error) {
    requestsEl.innerHTML = `<p>${escapeHtml(error.message || "Gagal memuat request.")}</p>`;
  }
}

function renderRequests(items) {
  if (!items.length) {
    requestsEl.innerHTML = "<p>Belum ada request.</p>";
    return;
  }

  requestsEl.innerHTML = `
    <div class="admin-table-wrap">
      <table class="compare-table admin-table operator-table">
        <thead>
          <tr>
            <th>Kode & Status</th>
            <th>Pembeli</th>
            <th>Paket & Payment</th>
            <th>Fingerprint</th>
            <th>License</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>${items.map(requestRow).join("")}</tbody>
      </table>
    </div>
  `;

  requestsEl.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button));
  });
}

function requestRow(item) {
  const code = item.activation_code;
  return `
    <tr>
      <td>
        <strong>${escapeHtml(code)}</strong><br>
        ${escapeHtml(item.activation_status || "-")}<br>
        <small>${formatDate(item.created_at)}</small>
      </td>
      <td>
        ${escapeHtml(item.buyer_name || "-")}<br>
        ${escapeHtml(item.practice_name || "-")}<br>
        ${escapeHtml(item.whatsapp || "-")}<br>
        ${escapeHtml(item.email || "-")}
      </td>
      <td>
        ${escapeHtml(item.package_label || item.package_key || "-")}<br>
        Payment: ${escapeHtml(item.payment_status || "-")}<br>
        ID: ${escapeHtml(item.midtrans_payment_id || "-")}
      </td>
      <td>${escapeHtml(item.device_fingerprint || "belum ada")}</td>
      <td>
        ${escapeHtml(item.license_id || "belum dibuat")}<br>
        ${item.license_key ? `<code class="operator-license">${escapeHtml(item.license_key)}</code>` : ""}
      </td>
      <td class="operator-actions">
        <button class="button secondary" type="button" data-action="payment-valid" data-code="${escapeHtml(code)}">Payment valid</button>
        <button class="button secondary" type="button" data-action="needs-fix" data-code="${escapeHtml(code)}">Perlu koreksi</button>
        <button class="button secondary" type="button" data-action="generate" data-code="${escapeHtml(code)}">Generate license</button>
        <button class="button secondary" type="button" data-action="sent" data-code="${escapeHtml(code)}">License dikirim</button>
        <button class="button secondary" type="button" data-action="copy-reply" data-code="${escapeHtml(code)}">Copy balasan</button>
      </td>
    </tr>
  `;
}

async function handleAction(button) {
  const code = button.dataset.code;
  const action = button.dataset.action;
  if (!code || !action) return;

  try {
    if (action === "payment-valid") {
      await callApi({
        action: "operator-update",
        activationCode: code,
        paymentStatus: "pembayaran_valid",
        activationStatus: "siap_generate_license",
      });
    } else if (action === "needs-fix") {
      const note = prompt("Catatan untuk pembeli/operator:", "Mohon cek ulang data aktivasi.");
      await callApi({
        action: "operator-update",
        activationCode: code,
        activationStatus: "perlu_perbaikan_data",
        adminNotes: note || "",
      });
    } else if (action === "generate") {
      await callApi({ action: "operator-generate-license", activationCode: code });
    } else if (action === "sent") {
      await callApi({ action: "operator-mark-license-sent", activationCode: code });
    } else if (action === "copy-reply") {
      await navigator.clipboard.writeText(
        `Halo, update aktivasi MedPraktik untuk kode ${code} sudah kami proses. Silakan cek halaman aktivasi dengan kode tersebut.`,
      );
      alert("Template balasan dicopy.");
    }
    await loadRequests();
  } catch (error) {
    alert(error.message || "Aksi gagal.");
  }
}

async function callApi(payload) {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-operator-token": operatorToken,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || "Request gagal.");
  return data;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
