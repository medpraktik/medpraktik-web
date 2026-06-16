const { requireEnv } = require("./sales-config");

function supabaseHeaders(prefer) {
  return {
    apikey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    Authorization: `Bearer ${requireEnv("SUPABASE_SERVICE_ROLE_KEY")}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function supabaseFetch(path, options = {}) {
  const baseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...supabaseHeaders(options.prefer),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data && data.message ? data.message : response.statusText;
    throw new Error(`Supabase ${response.status}: ${message}`);
  }
  return data;
}

async function insertRow(table, row) {
  const data = await supabaseFetch(table, {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify(row),
  });
  return data[0];
}

async function updateRows(table, query, patch) {
  return supabaseFetch(`${table}?${query}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify(patch),
  });
}

async function findOrderByOrderId(orderId) {
  const data = await supabaseFetch(
    `orders?order_id=eq.${encodeURIComponent(orderId)}&select=*`,
  );
  return data[0] || null;
}

async function findOrderByAccessToken(token) {
  const data = await supabaseFetch(
    `orders?access_token=eq.${encodeURIComponent(token)}&select=*`,
  );
  return data[0] || null;
}

async function findLicenseByOrderId(orderId) {
  const data = await supabaseFetch(
    `licenses?order_id=eq.${encodeURIComponent(orderId)}&select=*`,
  );
  return data[0] || null;
}

module.exports = {
  findLicenseByOrderId,
  findOrderByAccessToken,
  findOrderByOrderId,
  insertRow,
  supabaseFetch,
  updateRows,
};
