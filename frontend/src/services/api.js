const BASE = "/api/invoices";
const ITEMS_BASE = "/api/items";

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}

export const api = {
  // Fetch paginated + filtered list (no rows payload — fast)
  getInvoices: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== "" && v !== undefined))
    ).toString();
    return request(`${BASE}${qs ? "?" + qs : ""}`);
  },

  // Dashboard stats
  getStats: () => request(`${BASE}/stats`),

  // Single invoice with all rows
  getInvoice: (id) => request(`${BASE}/${id}`),

  // Create
  createInvoice: (body) => request(BASE, { method: "POST", body: JSON.stringify(body) }),

  // Update
  updateInvoice: (id, body) => request(`${BASE}/${id}`, { method: "PUT", body: JSON.stringify(body) }),

  // Delete
  deleteInvoice: (id) => request(`${BASE}/${id}`, { method: "DELETE" }),

  // ─── Items (rice name + brand + HSN code) ────────────────────────────────
  getItems: () => request(ITEMS_BASE),

  createItem: (body) => request(ITEMS_BASE, { method: "POST", body: JSON.stringify(body) }),

  updateItem: (id, body) => request(`${ITEMS_BASE}/${id}`, { method: "PUT", body: JSON.stringify(body) }),

  deleteItem: (id) => request(`${ITEMS_BASE}/${id}`, { method: "DELETE" }),
};
