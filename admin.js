const adminForm = document.querySelector("[data-admin-token-form]");
const adminOrders = document.querySelector("[data-admin-orders]");

adminForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = adminForm.elements.adminToken.value.trim();
  if (!token) return;
  sessionStorage.setItem("medpraktikAdminToken", token);
  await loadOrders(token);
});

const savedToken = sessionStorage.getItem("medpraktikAdminToken");
if (savedToken && adminForm) {
  adminForm.elements.adminToken.value = savedToken;
  loadOrders(savedToken);
}

async function loadOrders(token) {
  adminOrders.innerHTML = "<p>Memuat order...</p>";
  try {
    const response = await fetch(`/api/admin/orders?token=${encodeURIComponent(token)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Gagal memuat order.");
    renderOrders(data.orders || [], token);
  } catch (error) {
    adminOrders.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

function renderOrders(orders, token) {
  if (!orders.length) {
    adminOrders.innerHTML = "<p>Belum ada order.</p>";
    return;
  }
  adminOrders.innerHTML = `
    <div class="admin-table-wrap">
      <table class="compare-table admin-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Paket</th>
            <th>Status</th>
            <th>Kontak</th>
            <th>Fingerprint</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map((order) => orderRow(order)).join("")}
        </tbody>
      </table>
    </div>
  `;

  adminOrders.querySelectorAll("[data-approve-order]").forEach((button) => {
    button.addEventListener("click", async () => {
      await approveLicense(button.dataset.approveOrder, token);
    });
  });
}

function orderRow(order) {
  const canApprove = order.device_fingerprint && !order.license_id;
  return `
    <tr>
      <td><strong>${escapeHtml(order.order_id)}</strong><br>${escapeHtml(formatDate(order.created_at))}</td>
      <td>${escapeHtml(order.package_label)}<br>${formatAmount(order.amount)}</td>
      <td>${escapeHtml(order.status)}<br>${escapeHtml(order.payment_status)}</td>
      <td>${escapeHtml(order.practice_name)}<br>${escapeHtml(order.owner_name)}<br>${escapeHtml(order.email)}<br>${escapeHtml(order.whatsapp)}</td>
      <td>${escapeHtml(order.device_fingerprint || "belum ada")}</td>
      <td>
        ${
          canApprove
            ? `<button class="button secondary" type="button" data-approve-order="${escapeHtml(order.order_id)}">Approve License</button>`
            : escapeHtml(order.license_id || "-")
        }
      </td>
    </tr>
  `;
}

async function approveLicense(orderId, token) {
  if (!orderId) return;
  try {
    const response = await fetch("/api/admin/approve-license", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminToken: token, orderId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Approve gagal.");
    await loadOrders(token);
  } catch (error) {
    alert(error.message);
  }
}

function formatAmount(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0);
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
