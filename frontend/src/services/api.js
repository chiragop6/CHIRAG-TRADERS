// In production (e.g. Vercel), there is no CRA proxy, so relative "/api/..."
// requests hit the frontend's own domain, not the backend.
// REACT_APP_API_URL lets us point straight at the deployed backend on Render,
// while staying empty ("") in local dev so the package.json "proxy" still works.
const API_URL = process.env.REACT_APP_API_URL || "";

const BASE = `${API_URL}/api/invoices`;
const ITEMS_BASE = `${API_URL}/api/items`;

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

  // Returns the next available sequence number by reading all invoices from DB
  getNextInvoiceNo: async () => {
    const fy = (() => {
      const now = new Date();
      const yr  = now.getFullYear();
      const mo  = now.getMonth();
      const startYr = mo >= 3 ? yr : yr - 1;
      const endYr   = startYr + 1;
      return `${String(startYr).slice(-2)}-${String(endYr).slice(-2)}`;
    })();
    // Fetch all invoices (large limit) to find the true max sequence in DB
    const res = await request(`${BASE}?limit=10000&sortBy=invoiceNo&sortDir=desc`);
    const invoices = res.data || [];
    let maxSeq = 0;
    const pattern = new RegExp(`^CT/(\\d{4})/${fy}$`);
    for (const inv of invoices) {
      const m = (inv.invoiceNo || "").match(pattern);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxSeq) maxSeq = n;
      }
    }
    return maxSeq + 1;
  },

  // ─── Items (rice name + brand + HSN code) ────────────────────────────────
  getItems: () => request(ITEMS_BASE),

  createItem: (body) => request(ITEMS_BASE, { method: "POST", body: JSON.stringify(body) }),

  updateItem: (id, body) => request(`${ITEMS_BASE}/${id}`, { method: "PUT", body: JSON.stringify(body) }),

  deleteItem: (id) => request(`${ITEMS_BASE}/${id}`, { method: "DELETE" }),
};
