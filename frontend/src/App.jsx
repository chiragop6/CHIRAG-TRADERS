import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./services/api";
import logo from "./assets/chirag-traders-logo.png";

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════
function numToWords(n) {
  if (!n || isNaN(n)) return "";
  const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine",
    "Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  function convert(num) {
    if (num === 0) return "";
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num/10)] + (num%10 ? " " + ones[num%10] : "");
    if (num < 1000) return ones[Math.floor(num/100)] + " Hundred" + (num%100 ? " " + convert(num%100) : "");
    if (num < 100000) return convert(Math.floor(num/1000)) + " Thousand" + (num%1000 ? " " + convert(num%1000) : "");
    if (num < 10000000) return convert(Math.floor(num/100000)) + " Lakh" + (num%100000 ? " " + convert(num%100000) : "");
    return convert(Math.floor(num/10000000)) + " Crore" + (num%10000000 ? " " + convert(num%10000000) : "");
  }
  const intPart = Math.floor(n);
  const decPart = Math.round((n - intPart) * 100);
  let words = convert(intPart) || "Zero";
  words += " Rupees";
  if (decPart > 0) words += " and " + convert(decPart) + " Paise";
  return words + " Only";
}

function calcTotals(form) {
  const subTotal = (form.rows || []).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const discount = parseFloat(form.discount) || 0;
  const taxable  = subTotal - discount;
  const sgst     = taxable * (parseFloat(form.sgstPct) || 0) / 100;
  const cgst     = taxable * (parseFloat(form.cgstPct) || 0) / 100;
  const grand    = taxable + sgst + cgst;
  const roundOff = Math.round(grand) - grand;
  return { subTotal, discount, taxable, sgst, cgst, roundOff, grandTotal: Math.round(grand) };
}

function formatINR(n) {
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(str) {
  if (!str) return "—";
  const d = new Date(str);
  return isNaN(d) ? str : d.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
}

// ─── AUTO INVOICE NUMBER HELPERS ───────────────────────────────────────────
function getFiscalYear() {
  const now = new Date();
  const yr  = now.getFullYear();
  const mo  = now.getMonth(); // 0-indexed; April = 3
  const startYr = mo >= 3 ? yr : yr - 1;
  const endYr   = startYr + 1;
  return `${String(startYr).slice(-2)}-${String(endYr).slice(-2)}`; // e.g. "26-27"
}

function buildInvoiceNo(seq) {
  return `CT/${String(seq).padStart(4, "0")}/${getFiscalYear()}`;
}

// Reads the last used sequence from localStorage and returns next number
function getNextSequence() {
  const fy  = getFiscalYear();
  const key = `ct_inv_seq_${fy}`;
  const cur = parseInt(localStorage.getItem(key) || "0", 10);
  return cur + 1;
}

// Persists the sequence after a successful print
function commitSequence(seq) {
  const fy  = getFiscalYear();
  const key = `ct_inv_seq_${fy}`;
  localStorage.setItem(key, String(seq));
}

// ─── END AUTO INVOICE HELPERS ──────────────────────────────────────────────

// ─── ITEM NAME + BRAND (now stored in DB, managed via "Manage Items" page) ──
// Stored/displayed as "RICE TYPE(WEIGHT) – BRAND" so the printed invoice can
// split it into two lines (rice type bold on top, brand italic below).
const ITEM_SEP = " – "; // separator used inside the stored itemName string

const emptyRow  = () => ({ itemName:"", hsnCode:"", qty:"", altQty:"", unit:"", rate:"", amount:"" });
const blankForm = () => ({
  invoiceNo:"", date:"", gstin:"",
  customerName:"", address:"", mobile:"", customerGstin:"",
  discount:"0", sgstPct:"0", cgstPct:"0", notes:"",
  rows: [emptyRow()],
  _id: null,
  _invoiceSeq: null,   // tracks the sequence number claimed for this invoice
});

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const S = {
  // Layout
  app:        { minHeight:"100vh", background:"#f0f4fb", fontFamily:"Arial,sans-serif", color:"#111" },
  topbar:     { background:"#1a3a7a", color:"#fff", padding:"0 24px", display:"flex", alignItems:"center",
                justifyContent:"space-between", height:56, boxShadow:"0 2px 12px #0003", position:"sticky", top:0, zIndex:100 },
  main:       { display:"grid", gridTemplateColumns:"240px 1fr", height:"calc(100vh - 56px)" },
  sidebar:    { background:"#fff", borderRight:"1px solid #e5e7eb", display:"flex", flexDirection:"column",
                overflowY:"auto" },
  content:    { overflowY:"auto", padding:"22px 26px" },

  // Cards
  card:       { background:"#fff", borderRadius:10, border:"1px solid #e5e7eb", padding:"16px 18px", marginBottom:16 },
  sectionHdr: { margin:"0 0 14px", fontSize:13, fontWeight:700, color:"#1a3a7a", textTransform:"uppercase",
                letterSpacing:0.5, borderBottom:"2px solid #1a3a7a", paddingBottom:5 },

  // Stat card
  stat:       { background:"#fff", border:"1px solid #e5e7eb", borderRadius:10, padding:"14px 18px",
                display:"flex", flexDirection:"column", gap:4 },
  statLabel:  { fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:0.5 },
  statVal:    { fontSize:24, fontWeight:800, color:"#1a3a7a" },
  statSub:    { fontSize:11, color:"#9ca3af" },

  // Buttons
  btn: (v="primary") => ({
    padding:"8px 18px", borderRadius:7, border:"none", cursor:"pointer", fontWeight:700,
    fontSize:13, transition:"all .15s",
    ...(v==="primary"  ? { background:"#1a3a7a", color:"#fff" } : {}),
    ...(v==="outline"  ? { background:"transparent", border:"2px solid #1a3a7a", color:"#1a3a7a" } : {}),
    ...(v==="ghost"    ? { background:"#f3f4f6", color:"#374151", border:"1px solid #e5e7eb" } : {}),
    ...(v==="danger"   ? { background:"#fef2f2", color:"#991b1b", border:"1px solid #fecaca" } : {}),
    ...(v==="success"  ? { background:"#f0fdf4", color:"#166534", border:"1px solid #bbf7d0" } : {}),
    ...(v==="white"    ? { background:"#fff", color:"#1a3a7a", border:"none" } : {}),
  }),

  // Form
  label:  { fontSize:11, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:0.5, display:"block", marginBottom:4 },
  input:  { padding:"8px 10px", border:"1.5px solid #d1d5db", borderRadius:7, fontSize:14,
            outline:"none", background:"#fff", width:"100%", boxSizing:"border-box", fontFamily:"Arial,sans-serif" },
  select: { padding:"8px 10px", border:"1.5px solid #d1d5db", borderRadius:7, fontSize:14,
            outline:"none", background:"#fff", width:"100%", cursor:"pointer" },

  // Nav
  navItem: (active) => ({
    display:"flex", alignItems:"center", gap:10, padding:"11px 18px", cursor:"pointer",
    fontSize:14, fontWeight: active ? 700 : 500,
    color: active ? "#1a3a7a" : "#374151",
    background: active ? "#eef2ff" : "transparent",
    borderLeft: active ? "3px solid #1a3a7a" : "3px solid transparent",
    transition:"all .15s",
  }),

  // Table
  th: { padding:"9px 10px", textAlign:"left", fontWeight:700, fontSize:11, color:"#fff",
        background:"#1a3a7a", whiteSpace:"nowrap" },
  td: { padding:"9px 10px", fontSize:13, borderBottom:"1px solid #f1f5f9", verticalAlign:"middle" },

  // Badge
  badge: (color) => {
    const map = { green:["#f0fdf4","#166534"], blue:["#eff6ff","#1e40af"], red:["#fef2f2","#991b1b"],
                  yellow:["#fefce8","#854d0e"], gray:["#f9fafb","#374151"] };
    const [bg, txt] = map[color] || map.gray;
    return { background:bg, color:txt, padding:"3px 9px", borderRadius:20,
             fontSize:11, fontWeight:700, display:"inline-block", whiteSpace:"nowrap" };
  },

  // Toast
  toast: { position:"fixed", bottom:28, right:28, zIndex:9999, padding:"12px 22px",
           borderRadius:8, fontSize:14, fontWeight:600, boxShadow:"0 4px 24px #0003",
           display:"flex", alignItems:"center", gap:8 },
};

// ═══════════════════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════════════════
function Toast({ msg, type }) {
  if (!msg) return null;
  const colors = { success:["#f0fdf4","#166534"], error:["#fef2f2","#991b1b"], info:["#eff6ff","#1e40af"] };
  const [bg, c] = colors[type] || colors.info;
  const icons   = { success:"✅", error:"❌", info:"ℹ️" };
  return <div style={{...S.toast, background:bg, color:c}}>{icons[type]} {msg}</div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATS BAR
// ═══════════════════════════════════════════════════════════════════════════
function StatsBar({ stats }) {
  if (!stats) return null;
  const items = [
    { label:"Total Invoices",  val: stats.totalInvoices,              sub:"All time",          icon:"🧾" },
    { label:"Total Revenue",   val: "₹"+formatINR(stats.totalRevenue), sub:"All time",         icon:"💰" },
    { label:"This Month",      val: "₹"+formatINR(stats.monthlyRevenue), sub:"Current month",  icon:"📅" },
    { label:"Today",           val: stats.todayInvoices+" invoices",   sub:"Billed today",     icon:"⚡" },
  ];
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:22 }}>
      {items.map(({ label, val, sub, icon }) => (
        <div key={label} style={S.stat}>
          <span style={S.statLabel}>{icon} {label}</span>
          <span style={S.statVal}>{val}</span>
          <span style={S.statSub}>{sub}</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HISTORY PAGE
// ═══════════════════════════════════════════════════════════════════════════
function HistoryPage({ onEdit, onView, toast }) {
  const [invoices, setInvoices] = useState([]);
  const [stats,    setStats]    = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [pagination, setPagination] = useState({ total:0, page:1, limit:20, pages:1 });

  const [search,   setSearch]   = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [sortBy,   setSortBy]   = useState("createdAt");
  const [order,    setOrder]    = useState("desc");

  const debounceRef = useRef(null);

  const fetchInvoices = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const res = await api.getInvoices({
        search, dateFrom, dateTo, sortBy, order,
        page: pagination.page, limit: pagination.limit,
        ...params,
      });
      setInvoices(res.data);
      setPagination(res.pagination);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [search, dateFrom, dateTo, sortBy, order, pagination.page, pagination.limit]);

  const fetchStats = useCallback(async () => {
    try { const r = await api.getStats(); setStats(r.data); }
    catch {}
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Debounce search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchInvoices({ page:1 }), 350);
    return () => clearTimeout(debounceRef.current);
  }, [search, dateFrom, dateTo, sortBy, order]);

  const handleDelete = async (id, invNo) => {
    if (!window.confirm(`Delete Invoice #${invNo}? This cannot be undone.`)) return;
    try {
      await api.deleteInvoice(id);
      toast("Invoice deleted", "success");
      fetchInvoices();
      fetchStats();
    } catch (e) { toast(e.message, "error"); }
  };

  const clearFilters = () => { setSearch(""); setDateFrom(""); setDateTo(""); setSortBy("createdAt"); setOrder("desc"); };

  const hasFilters = search || dateFrom || dateTo || sortBy !== "createdAt" || order !== "desc";

  return (
    <div>
      <StatsBar stats={stats} />

      {/* Filters */}
      <div style={{...S.card, marginBottom:18}}>
        <h3 style={S.sectionHdr}>Search &amp; Filter</h3>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr auto", gap:12, alignItems:"flex-end" }}>
          <div>
            <label style={S.label}>🔍 Search</label>
            <input style={S.input} placeholder="Invoice no, customer name, mobile, item..." value={search}
              onChange={e=>setSearch(e.target.value)}
              onFocus={e=>e.target.style.borderColor="#1a3a7a"}
              onBlur={e=>e.target.style.borderColor="#d1d5db"} />
          </div>
          <div>
            <label style={S.label}>📅 From Date</label>
            <input type="date" style={S.input} value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
              onFocus={e=>e.target.style.borderColor="#1a3a7a"} onBlur={e=>e.target.style.borderColor="#d1d5db"} />
          </div>
          <div>
            <label style={S.label}>📅 To Date</label>
            <input type="date" style={S.input} value={dateTo} onChange={e=>setDateTo(e.target.value)}
              onFocus={e=>e.target.style.borderColor="#1a3a7a"} onBlur={e=>e.target.style.borderColor="#d1d5db"} />
          </div>
          <div>
            <label style={S.label}>Sort By</label>
            <select style={S.select} value={sortBy} onChange={e=>setSortBy(e.target.value)}>
              <option value="createdAt">Created Date</option>
              <option value="date">Invoice Date</option>
              <option value="grandTotal">Amount</option>
              <option value="invoiceNo">Invoice No</option>
              <option value="customerName">Customer</option>
            </select>
          </div>
          <div>
            <label style={S.label}>Order</label>
            <select style={S.select} value={order} onChange={e=>setOrder(e.target.value)}>
              <option value="desc">Newest First</option>
              <option value="asc">Oldest First</option>
            </select>
          </div>
          <div>
            {hasFilters && (
              <button style={{ ...S.btn("danger"), whiteSpace:"nowrap" }} onClick={clearFilters}>✕ Clear</button>
            )}
          </div>
        </div>
        {hasFilters && (
          <div style={{ marginTop:10, fontSize:12, color:"#6b7280" }}>
            Showing <b>{pagination.total}</b> result{pagination.total !== 1 ? "s" : ""}
            {search ? ` for "${search}"` : ""}
            {(dateFrom || dateTo) ? ` · Date: ${dateFrom||"start"} → ${dateTo||"now"}` : ""}
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{ ...S.card, padding:0, overflow:"hidden" }}>
        <div style={{ padding:"14px 18px 10px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <h3 style={{ ...S.sectionHdr, margin:0, border:"none", padding:0 }}>Invoice History</h3>
          <span style={{ fontSize:12, color:"#9ca3af" }}>
            {pagination.total} total · Page {pagination.page} of {pagination.pages}
          </span>
        </div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr>
                {["Invoice No","Customer","Date","Mobile","Amount","Actions"].map(h=>(
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ ...S.td, textAlign:"center", padding:30, color:"#9ca3af" }}>Loading…</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={6} style={{ ...S.td, textAlign:"center", padding:40 }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>🧾</div>
                  <div style={{ fontSize:15, fontWeight:600, color:"#374151", marginBottom:6 }}>No invoices found</div>
                  <div style={{ fontSize:13, color:"#9ca3af" }}>
                    {hasFilters ? "Try different search terms or clear filters." : "Create your first invoice to get started."}
                  </div>
                </td></tr>
              ) : invoices.map((inv, i) => (
                <tr key={inv._id} style={{ background: i%2===0?"#fff":"#f9fafb" }}>
                  <td style={S.td}><span style={S.badge("blue")}>{inv.invoiceNo}</span></td>
                  <td style={{ ...S.td, fontWeight:600 }}>{inv.customerName || "—"}</td>
                  <td style={S.td}>{formatDate(inv.date)}</td>
                  <td style={S.td}>{inv.mobile || "—"}</td>
                  <td style={{ ...S.td, fontWeight:700, color:"#166534" }}>₹{formatINR(inv.grandTotal)}</td>
                  <td style={S.td}>
                    <div style={{ display:"flex", gap:6 }}>
                      <button style={{ ...S.btn("ghost"), padding:"5px 10px", fontSize:12 }}
                        onClick={() => onView(inv._id)}>👁️ View</button>
                      <button style={{ ...S.btn("outline"), padding:"5px 10px", fontSize:12 }}
                        onClick={() => onEdit(inv._id)}>✏️ Edit</button>
                      <button style={{ ...S.btn("danger"), padding:"5px 10px", fontSize:12 }}
                        onClick={() => handleDelete(inv._id, inv.invoiceNo)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div style={{ display:"flex", gap:6, padding:"12px 18px", justifyContent:"center", borderTop:"1px solid #f1f5f9" }}>
            <button style={S.btn("ghost")} disabled={pagination.page===1}
              onClick={()=>fetchInvoices({ page: pagination.page-1 })}>← Prev</button>
            {Array.from({ length: Math.min(pagination.pages, 7) }, (_,i)=>{
              const p = pagination.pages <= 7 ? i+1
                : pagination.page <= 4 ? i+1
                : pagination.page >= pagination.pages-3 ? pagination.pages-6+i
                : pagination.page-3+i;
              return (
                <button key={p} style={{
                  ...S.btn(p===pagination.page?"primary":"ghost"),
                  padding:"8px 13px", minWidth:36
                }} onClick={()=>fetchInvoices({ page:p })}>{p}</button>
              );
            })}
            <button style={S.btn("ghost")} disabled={pagination.page===pagination.pages}
              onClick={()=>fetchInvoices({ page: pagination.page+1 })}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FORM FIELD — defined OUTSIDE InvoiceForm so it never remounts on re-render
// ═══════════════════════════════════════════════════════════════════════════
function FormField({ label, name, type="text", span=1, placeholder="", value, onChange, readOnly=false }) {
  return (
    <div style={{ gridColumn:`span ${span}`, display:"flex", flexDirection:"column", gap:4 }}>
      <label style={S.label}>{label}</label>
      <input type={type} value={value||""} placeholder={placeholder}
        readOnly={readOnly}
        onChange={e=>!readOnly && onChange(name, e.target.value)}
        style={{ ...S.input, ...(readOnly ? { background:"#f3f4f6", color:"#374151", cursor:"not-allowed" } : {}) }}
        onFocus={e=>{ if(!readOnly) e.target.style.borderColor="#1a3a7a"; }}
        onBlur={e=>e.target.style.borderColor="#d1d5db"} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// INVOICE FORM
// ═══════════════════════════════════════════════════════════════════════════
function InvoiceForm({ form, setForm }) {
  const MAX_ROWS = 18;
  const [items, setItems] = useState([]);

  // Load the item + brand list from the database for suggestions
  useEffect(() => {
    api.getItems()
      .then(r => setItems(r.data || []))
      .catch(() => setItems([]));
  }, []);

  const itemOptions = items.map(it => `${it.name}${ITEM_SEP}${it.brand}`);

  const handleField = (name, value) => setForm(f => ({ ...f, [name]: value }));

  const updateRow = (i, field, val) => {
    const rows = form.rows.map((r, idx) => {
      if (idx !== i) return r;
      const updated = { ...r, [field]: val };
      // If the typed/selected value matches a known item+brand, auto-fill its HSN code
      if (field === "itemName") {
        const match = items.find(it => `${it.name}${ITEM_SEP}${it.brand}` === val);
        if (match) updated.hsnCode = match.hsnCode || "";
      }
      // Recalculate amount whenever qty, altQty, or rate changes
      // Formula: qty (bags) × altQty (kg per bag) × rate (price per kg)
      // If altQty is blank/0, fall back to qty × rate
      if (field === "qty" || field === "altQty" || field === "rate") {
        const q  = parseFloat(field === "qty"    ? val : r.qty)    || 0;
        const aq = parseFloat(field === "altQty" ? val : r.altQty) || 0;
        const rt = parseFloat(field === "rate"   ? val : r.rate)   || 0;
        if (q && rt) {
          // Use altQty as multiplier only when it has a value
          updated.amount = aq ? (q * aq * rt).toFixed(2) : (q * rt).toFixed(2);
        } else {
          updated.amount = "";
        }
      }
      return updated;
    });
    setForm(f => ({ ...f, rows }));
  };

  const addRow = () => {
    if (form.rows.length >= MAX_ROWS) return;
    setForm(f => ({ ...f, rows: [...f.rows, emptyRow()] }));
  };

  const removeRow = (i) => {
    if (form.rows.length <= 1) return;
    setForm(f => ({ ...f, rows: f.rows.filter((_, idx) => idx !== i) }));
  };

  const totals = calcTotals(form);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* Invoice Meta */}
      <div style={S.card}>
        <h3 style={S.sectionHdr}>Invoice Details</h3>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
          {/* Invoice number is auto-generated and read-only */}
          <FormField label="Invoice No (Auto)" name="invoiceNo" placeholder="Auto-generated" value={form.invoiceNo} onChange={handleField} readOnly={true} />
          <FormField label="Date" name="date" type="date" value={form.date} onChange={handleField} />
          <FormField label="GSTIN No" name="gstin" placeholder="Your GSTIN" value={form.gstin} onChange={handleField} />
        </div>
      </div>

      {/* Customer */}
      <div style={S.card}>
        <h3 style={S.sectionHdr}>Customer Details</h3>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <FormField label="Customer Name" name="customerName" span={2} value={form.customerName} onChange={handleField} />
          <FormField label="Address" name="address" span={2} value={form.address} onChange={handleField} />
          <FormField label="Mobile Number" name="mobile" type="tel" value={form.mobile} onChange={handleField} />
          <FormField label="Customer GSTIN" name="customerGstin" value={form.customerGstin} onChange={handleField} />
        </div>
      </div>

      {/* Items */}
      <div style={S.card}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <h3 style={{ ...S.sectionHdr, margin:0, border:"none", padding:0 }}>Items</h3>
          <div style={{ display:"flex", gap:12, alignItems:"center" }}>
            <span style={{ fontSize:11, color:"#6b7280", fontStyle:"italic" }}>
              Amount = Qty × Alt Qty × Rate &nbsp;(Alt Qty blank → Qty × Rate)
            </span>
            <span style={{ fontSize:12, color:"#9ca3af" }}>{form.rows.length} / {MAX_ROWS} items</span>
          </div>
        </div>
        <datalist id="itemNameSuggestions">
          {itemOptions.map(opt => <option key={opt} value={opt} />)}
        </datalist>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead>
              <tr style={{ background:"#1a3a7a" }}>
                {["#","Item Name","HSN Code","Qty (Bags)","Alt Qty (Kg/Bag)","Unit","Rate (₹/Kg)","Amount (₹)",""].map(h=>(
                  <th key={h} style={{ ...S.th, background:"#1a3a7a" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {form.rows.map((row, i) => (
                <tr key={i} style={{ background: i%2===0 ? "#fff" : "#f9fafb" }}>
                  <td style={{ padding:"3px 6px", color:"#9ca3af", fontSize:12, textAlign:"center", width:28 }}>{i+1}</td>
                  {["itemName","hsnCode","qty","altQty","unit","rate","amount"].map(f => (
                    <td key={f} style={{ padding:"2px 4px" }}>
                      <input value={row[f]||""} readOnly={f==="amount"}
                        onChange={e=>updateRow(i,f,e.target.value)}
                        list={f==="itemName" ? "itemNameSuggestions" : undefined}
                        style={{
                          width:"100%", padding:"5px 6px", border:"1px solid #e5e7eb",
                          borderRadius:5, fontSize:13, boxSizing:"border-box",
                          background: f==="amount" ? "#f3f4f6" : "#fff", outline:"none",
                          minWidth: f==="itemName"?130:f==="hsnCode"?70:50,
                          fontFamily:"Arial,sans-serif"
                        }}
                        onFocus={e=>{ if(f!=="amount") e.target.style.borderColor="#1a3a7a"; }}
                        onBlur={e=>e.target.style.borderColor="#e5e7eb"} />
                    </td>
                  ))}
                  <td style={{ padding:"2px 6px", textAlign:"center", width:32 }}>
                    {form.rows.length > 1 && (
                      <button onClick={()=>removeRow(i)} title="Remove row"
                        style={{ background:"none", border:"none", cursor:"pointer", color:"#ef4444", fontSize:16, lineHeight:1, padding:"2px 4px" }}>
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {form.rows.length < MAX_ROWS && (
          <button onClick={addRow} style={{
            marginTop:12, padding:"7px 18px", borderRadius:7, border:"2px dashed #1a3a7a",
            background:"transparent", color:"#1a3a7a", fontWeight:700, fontSize:13, cursor:"pointer",
            display:"flex", alignItems:"center", gap:6
          }}>
            + Add Item
          </button>
        )}
        {form.rows.length >= MAX_ROWS && (
          <div style={{ marginTop:10, fontSize:12, color:"#9ca3af" }}>Maximum 18 items reached.</div>
        )}
      </div>

      {/* Tax + Live Totals */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div style={S.card}>
          <h3 style={S.sectionHdr}>Tax &amp; Discount</h3>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
            <FormField label="Discount (₹)" name="discount" type="number" value={form.discount} onChange={handleField} />
            <FormField label="SGST %" name="sgstPct" type="number" value={form.sgstPct} onChange={handleField} />
            <FormField label="CGST %" name="cgstPct" type="number" value={form.cgstPct} onChange={handleField} />
          </div>
        </div>
        <div style={S.card}>
          <h3 style={S.sectionHdr}>Live Total</h3>
          {[
            ["Sub Total",     formatINR(totals.subTotal)],
            ["Discount",      formatINR(totals.discount)],
            ["Taxable Value", formatINR(totals.taxable)],
            [`SGST (${form.sgstPct||0}%)`, formatINR(totals.sgst)],
            [`CGST (${form.cgstPct||0}%)`, formatINR(totals.cgst)],
            ["Round Off",     totals.roundOff.toFixed(2)],
          ].map(([l,v]) => (
            <div key={l} style={{ display:"flex", justifyContent:"space-between", fontSize:13,
              padding:"4px 0", borderBottom:"0.5px solid #f1f5f9", color:"#374151" }}>
              <span>{l}</span><span style={{ fontWeight:600 }}>₹{v}</span>
            </div>
          ))}
          <div style={{ display:"flex", justifyContent:"space-between", marginTop:8,
            background:"#1a3a7a", color:"#fff", padding:"8px 12px", borderRadius:6, fontWeight:800, fontSize:15 }}>
            <span>Grand Total</span>
            <span>₹{formatINR(totals.grandTotal)}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div style={S.card}>
        <h3 style={S.sectionHdr}>Notes</h3>
        <textarea value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={3}
          placeholder="Any notes for the customer..." style={{ ...S.input, resize:"vertical" }}
          onFocus={e=>e.target.style.borderColor="#1a3a7a"} onBlur={e=>e.target.style.borderColor="#d1d5db"} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// INVOICE PREVIEW (Print Template) — Highly Polished Match
// ═══════════════════════════════════════════════════════════════════════════
function IconCircle({ icon }) {
  const paths = {
    pin:   "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z",
    phone: "M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2z",
    doc:   "M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5L14 3.5zM7 12h10v1.5H7V12zm0 4h10v1.5H7V16zm0-8h5v1.5H7V8z",
  };
  return (
    <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#10367a",
      display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg viewBox="0 0 24 24" width="10" height="10" fill="#fff"><path d={paths[icon]} /></svg>
    </span>
  );
}

function InvoicePreview({ form }) {
  const totals = calcTotals(form);
  const fmt = (v) => (v ? parseFloat(v).toFixed(2) : "");
  const primaryBlue = "#10367a";

  return (
    <div id="invoice-print-area" className="page-container" style={{
      width: "210mm",
      minHeight: "297mm",
      margin: "0 auto",
      background: "#fff",
      padding: "10mm",
      boxShadow: "0 0 15px rgba(0,0,0,0.15)",
      fontFamily: "Arial, sans-serif",
      position: "relative",
      color: "#000",
      boxSizing: "border-box"
    }}>
      
      {/* Main Outer Border */}
      <div style={{ border: "2px solid #222", height: "100%", minHeight: "277mm", display: "flex", flexDirection: "column", position: "relative" }}>
        
        {/* Top Right Black/Blue Graphic Header */}
        <div style={{ position: "absolute", top: -2, right: -2, width: "350px", height: "42px", display: "flex", justifyContent: "flex-end", zIndex: 0 }}>
           <div style={{ width: "100%", height: "100%", background: primaryBlue, clipPath: "polygon(12% 0, 100% 0, 100% 100%, 0 0)" }}></div>
           <div style={{ position: "absolute", top: 0, right: 0, width: "88%", height: "100%", background: "#111", clipPath: "polygon(12% 0, 100% 0, 100% 100%, 0 0)" }}></div>
        </div>

        {/* --- HEADER SECTION --- */}
        <div style={{ padding: "18px 20px 10px 20px", display: "flex", justifyContent: "space-between", zIndex: 1, position: "relative" }}>
          
          {/* Logo & Company Name */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <img src={logo} alt="Chirag Traders" style={{ width: "64px", height: "64px", objectFit: "contain" }} />
            <div>
              <div style={{ fontSize: "38px", fontWeight: 900, color: primaryBlue, letterSpacing: "0.5px", margin: 0, lineHeight: 1 }}>
                CHIRAG TRADERS
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <div style={{ height: "1.5px", flex: 1, background: primaryBlue }}></div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#222", letterSpacing: "1.2px" }}>
                  RICE AND DAL BUSINESS
                </div>
                <div style={{ height: "1.5px", flex: 1, background: primaryBlue }}></div>
              </div>
            </div>
          </div>

          {/* Tax Invoice Box */}
          <div style={{ marginTop: "22px", marginRight: "12px" }}>
             <div style={{ background: primaryBlue, color: "#fff", fontWeight: 900, fontSize: "19px", padding: "6px 22px" }}>
               TAX INVOICE
             </div>
          </div>
        </div>

        {/* --- ADDRESS & DETAILS SECTION --- */}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "0 20px 15px", fontSize: "12px", lineHeight: "1.6" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <IconCircle icon="pin" />
              <div style={{ fontWeight: 600 }}>
                243/B ACHARYA PRAFULLA CHANDRA ROAD<br/>
                KOLKATA 700006
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
              <IconCircle icon="phone" />
              <span style={{ fontWeight: 600 }}>Phone: 8910161917 / 8910070449</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
              <IconCircle icon="doc" />
              <span style={{ fontWeight: 600 }}>GSTIN No.: <span style={{ borderBottom: "1px solid #333", paddingBottom: 1, minWidth: "150px", display: "inline-block" }}>{form.gstin || ""}</span></span>
            </div>
          </div>
          
          <div style={{ width: "230px", display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <span style={{ width: "85px", fontWeight: 600 }}>Invoice No.:</span>
              <span style={{ borderBottom: "1px solid #111", flex: 1, textAlign: "center", fontSize: "13px", paddingBottom: "2px" }}>{form.invoiceNo || ""}</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <span style={{ width: "85px", fontWeight: 600 }}>Date:</span>
              <span style={{ borderBottom: "1px solid #111", flex: 1, textAlign: "center", fontSize: "13px", paddingBottom: "2px" }}>
                {form.date ? new Date(form.date).toLocaleDateString("en-GB") : ""}
              </span>
            </div>
          </div>
        </div>

        {/* --- CUSTOMER DETAILS SECTION --- */}
        <div style={{ margin: "5px 10px 15px", border: `1.5px solid ${primaryBlue}`, borderRadius: "5px", position: "relative", padding: "25px 15px 12px" }}>
          <div style={{ 
            position: "absolute", top: -1.5, left: -1.5, 
            background: primaryBlue, color: "#fff", 
            fontWeight: 700, fontSize: "12px", 
            padding: "5px 35px 5px 12px", 
            clipPath: "polygon(0 0, 100% 0, 92% 100%, 0 100%)",
            borderTopLeftRadius: "3px"
          }}>
            CUSTOMER DETAILS
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: "12.5px" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <span style={{ whiteSpace: "nowrap" }}>Customer Name:</span>
              <span style={{ borderBottom: "1px solid #444", flex: 1, paddingBottom: "2px" }}>{form.customerName || ""}</span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <span style={{ whiteSpace: "nowrap" }}>Address:</span>
              <span style={{ borderBottom: "1px solid #444", flex: 1, paddingBottom: "2px" }}>{form.address || ""}</span>
            </div>
            <div style={{ display: "flex", gap: 20, alignItems: "flex-end" }}>
              <div style={{ display: "flex", gap: 10, flex: 1, alignItems: "flex-end" }}>
                <span style={{ whiteSpace: "nowrap" }}>Mobile Number:</span>
                <span style={{ borderBottom: "1px solid #444", flex: 1, paddingBottom: "2px" }}>{form.mobile || ""}</span>
              </div>
              <div style={{ display: "flex", gap: 10, flex: 1, alignItems: "flex-end" }}>
                <span style={{ whiteSpace: "nowrap" }}>GSTIN (if applicable):</span>
                <span style={{ borderBottom: "1px solid #444", flex: 1, paddingBottom: "2px" }}>{form.customerGstin || ""}</span>
              </div>
            </div>
          </div>
        </div>

        {/* --- TABLE SECTION --- */}
        <div style={{ padding: "0 10px", flex: 1 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", border: `1.5px solid ${primaryBlue}` }}>
            <thead>
              <tr style={{ background: primaryBlue, color: "#fff" }}>
                {["Sl No", "Item Name", "HSN Code", "Qty", "Alt Qty", "Unit", "Rate", "Amount"].map((h, i) => (
                  <th key={i} style={{ padding: "7px 4px", border: `1px solid ${primaryBlue}`, textAlign: "center", fontWeight: 700 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {form.rows.map((row, i) => (
                <tr key={i}>
                  <td style={{ padding: "5px", border: "1px solid #aaa", textAlign: "center", height: "23px", color: "#333" }}>{i + 1}</td>
                  <td style={{ padding: "5px 8px", border: "1px solid #aaa", color: "#111" }}>
                    {row.itemName ? (
                      row.itemName.includes(ITEM_SEP) ? (
                        <>
                          <div style={{ fontWeight: 600 }}>{row.itemName.split(ITEM_SEP)[0]}</div>
                          <div style={{ fontStyle: "italic", fontWeight: 400, fontSize: "10px" }}>{row.itemName.split(ITEM_SEP)[1]}</div>
                        </>
                      ) : (
                        <div style={{ fontWeight: 600 }}>{row.itemName}</div>
                      )
                    ) : ""}
                  </td>
                  <td style={{ padding: "5px", border: "1px solid #aaa", textAlign: "center", color: "#333" }}>{row.hsnCode || ""}</td>
                  <td style={{ padding: "5px", border: "1px solid #aaa", textAlign: "center", color: "#333" }}>{row.qty || ""}</td>
                  <td style={{ padding: "5px", border: "1px solid #aaa", textAlign: "center", color: "#333" }}>{row.altQty || ""}</td>
                  <td style={{ padding: "5px", border: "1px solid #aaa", textAlign: "center", color: "#333" }}>{row.unit || ""}</td>
                  <td style={{ padding: "5px 8px", border: "1px solid #aaa", textAlign: "right", color: "#333" }}>{row.rate || ""}</td>
                  <td style={{ padding: "5px 8px", border: "1px solid #aaa", textAlign: "right", color: "#111", fontWeight: row.amount ? 600 : 400 }}>{row.amount ? fmt(row.amount) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* --- FOOTER & TOTALS SECTION --- */}
        <div style={{ display: "flex", padding: "0 10px", marginTop: "12px" }}>
          
          {/* Amount in words, Notes & Signatures */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", border: "1px solid #888", minHeight: "160px" }}>
            {/* Amount in Words header */}
            <div style={{ background: primaryBlue, color: "#fff", padding: "5px 10px", fontSize: "11.5px", fontWeight: 700 }}>
              Amount in Words:
            </div>
            {/* Words value */}
            <div style={{ padding: "10px", fontSize: "11.5px", fontStyle: "italic", minHeight: "40px", color: "#111", fontWeight: 600, borderBottom: "1px solid #888" }}>
               {numToWords(totals.grandTotal)}
            </div>
            
            {/* Notes + lines + Receiver signature at bottom */}
            <div style={{ padding: "10px", flex: 1, display: "flex", flexDirection: "column" }}>
               <div>
                  <span style={{ fontSize: "11.5px", fontWeight: 700 }}>Notes: </span>
                  <span style={{ fontSize: "11px", color: "#333" }}>{form.notes}</span>
                  <div style={{ borderBottom: "1px solid #ccc", marginTop: "18px" }}></div>
                  <div style={{ borderBottom: "1px solid #ccc", marginTop: "18px" }}></div>
               </div>
               {/* Receiver's Signature pushed to bottom */}
               <div style={{ marginTop: "auto", paddingTop: "16px", fontSize: "11.5px", fontWeight: 600, display: "flex", gap: 5 }}>
                  Receiver's Signature: <span style={{ display: "inline-block", borderBottom: "1px solid #222", flex: 1, maxWidth: "200px" }}></span>
               </div>
            </div>
          </div>

          {/* Totals Block */}
          <div style={{ width: "270px", borderTop: "1px solid #888", borderBottom: "1px solid #888", borderRight: "1px solid #888", display: "flex", flexDirection: "column" }}>
            {[
              ["Sub Total:", fmt(totals.subTotal)],
              ["Discount:", fmt(totals.discount)],
              ["Taxable Value:", fmt(totals.taxable)],
              [`SGST (${form.sgstPct || 0}%):`, fmt(totals.sgst)],
              [`CGST (${form.cgstPct || 0}%):`, fmt(totals.cgst)],
              ["Round Off:", fmt(totals.roundOff)]
            ].map(([label, val], idx) => (
              <div key={idx} style={{ display: "flex", borderBottom: "1px solid #888", padding: "5px 10px", fontSize: "11.5px" }}>
                <div style={{ flex: 1, fontWeight: 700, textAlign: "center", color: "#111" }}>{label}</div>
                <div style={{ width: "85px", textAlign: "right", color: "#333" }}>{val}</div>
              </div>
            ))}
            
            <div style={{ background: primaryBlue, color: "#fff", display: "flex", padding: "7px 10px", fontSize: "12.5px", fontWeight: 700 }}>
              <div style={{ flex: 1, textAlign: "center" }}>GRAND TOTAL:</div>
              <div style={{ width: "85px", textAlign: "right" }}>{fmt(totals.grandTotal)}</div>
            </div>

            <div style={{ flex: 1, padding: "10px", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }}>
               <div style={{ fontWeight: 800, fontSize: "13px", marginBottom: "35px", color: "#111" }}>For CHIRAG TRADERS</div>
               <div style={{ fontSize: "11px", display: "flex", gap: 6, width: "100%", justifyContent: "center" }}>
                 <span style={{ whiteSpace: "nowrap" }}>Authorized Signature:</span>
                 <span style={{ borderBottom: "1px solid #222", width: "120px" }}></span>
               </div>
            </div>
          </div>
        </div>

        {/* --- BOTTOM BANNER --- */}
        <div style={{ marginTop: "12px", display: "flex", height: "32px", position: "relative", overflow: "hidden" }}>
           <div style={{ background: primaryBlue, color: "#fff", width: "68%", paddingLeft: "15px", display: "flex", alignItems: "center", fontSize: "12.5px", fontWeight: 700, letterSpacing: "0.5px", clipPath: "polygon(0 0, 96% 0, 100% 100%, 0 100%)", zIndex: 2 }}>
              THANK YOU FOR YOUR BUSINESS!
           </div>
           <div style={{ background: "#ccc", position: "absolute", right: "31.5%", top: 0, width: "20px", height: "100%", clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%)", transform: "skewX(-35deg)", zIndex: 1 }}></div>
           <div style={{ background: "#111", color: "#fff", width: "35%", position: "absolute", right: 0, height: "100%", paddingRight: "15px", display: "flex", alignItems: "center", justifyContent: "flex-end", fontSize: "11px", letterSpacing: "0.5px", clipPath: "polygon(10% 0, 100% 0, 100% 100%, 0 100%)", zIndex: 0 }}>
              Registered &amp; Compliant
           </div>
        </div>

      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ITEMS PAGE (manage rice names, brands, HSN codes)
// ═══════════════════════════════════════════════════════════════════════════
function ItemsPage({ toast }) {
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm]           = useState({ name:"", brand:"", hsnCode:"" });

  const load = () => {
    setLoading(true);
    api.getItems()
      .then(r => setItems(r.data || []))
      .catch(e => toast(e.message, "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => { setForm({ name:"", brand:"", hsnCode:"" }); setEditingId(null); };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.brand.trim()) {
      toast("Rice name and brand are required", "error");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.updateItem(editingId, form);
        toast("Item updated!", "success");
      } else {
        await api.createItem(form);
        toast("Item added!", "success");
      }
      resetForm();
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (it) => {
    setEditingId(it._id);
    setForm({ name: it.name, brand: it.brand, hsnCode: it.hsnCode || "" });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this item? This cannot be undone.")) return;
    try {
      await api.deleteItem(id);
      toast("Item deleted", "success");
      if (editingId === id) resetForm();
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  return (
    <div>
      {/* Add / Edit form */}
      <div style={S.card}>
        <h3 style={S.sectionHdr}>{editingId ? "Edit Item" : "Add New Item"}</h3>
        <div style={{ display:"grid", gridTemplateColumns:"1.3fr 1fr 0.9fr auto", gap:12, alignItems:"end" }}>
          <div>
            <label style={S.label}>Rice Name</label>
            <input style={S.input} placeholder="e.g. PERBOILED RICE(26KG)"
              value={form.name}
              onChange={e=>setForm(f=>({...f, name:e.target.value.toUpperCase()}))} />
          </div>
          <div>
            <label style={S.label}>Brand Name</label>
            <input style={S.input} placeholder="e.g. DOUBLE DEER"
              value={form.brand}
              onChange={e=>setForm(f=>({...f, brand:e.target.value.toUpperCase()}))} />
          </div>
          <div>
            <label style={S.label}>HSN Code</label>
            <input style={S.input} placeholder="e.g. 10063020"
              value={form.hsnCode}
              onChange={e=>setForm(f=>({...f, hsnCode:e.target.value}))} />
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button style={S.btn("primary")} disabled={saving} onClick={handleSubmit}>
              {saving ? "Saving…" : editingId ? "Update" : "+ Add Item"}
            </button>
            {editingId && (
              <button style={S.btn("ghost")} onClick={resetForm}>Cancel</button>
            )}
          </div>
        </div>
      </div>

      {/* Item list */}
      <div style={S.card}>
        <h3 style={S.sectionHdr}>All Items ({items.length})</h3>
        {loading ? (
          <div style={{ textAlign:"center", padding:30, color:"#9ca3af" }}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={{ textAlign:"center", padding:30, color:"#9ca3af" }}>No items yet. Add one above.</div>
        ) : (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ background:"#1a3a7a" }}>
                  {["Rice Name","Brand","HSN Code",""].map(h=>(
                    <th key={h} style={{ ...S.th, background:"#1a3a7a" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it._id} style={{ background: i%2===0 ? "#fff" : "#f9fafb" }}>
                    <td style={S.td}>{it.name}</td>
                    <td style={{ ...S.td, fontStyle:"italic", color:"#6b7280" }}>{it.brand}</td>
                    <td style={S.td}>{it.hsnCode || "—"}</td>
                    <td style={{ ...S.td, textAlign:"right", whiteSpace:"nowrap" }}>
                      <button onClick={()=>handleEdit(it)}
                        style={{ ...S.btn("ghost"), padding:"5px 10px", fontSize:12, marginRight:6 }}>
                        ✏️ Edit
                      </button>
                      <button onClick={()=>handleDelete(it._id)}
                        style={{ ...S.btn("danger"), padding:"5px 10px", fontSize:12 }}>
                        🗑️ Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CREATE / EDIT PAGE
// ═══════════════════════════════════════════════════════════════════════════
function CreateEditPage({ editId, onDone, toast }) {
  const [form, setForm]       = useState(blankForm());
  const [tab, setTab]         = useState("form");
  const [saving, setSaving]   = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!editId) {
      // New invoice — assign next auto number immediately
      const seq = getNextSequence();
      setForm({ ...blankForm(), invoiceNo: buildInvoiceNo(seq), _invoiceSeq: seq });
      return;
    }
    setLoading(true);
    api.getInvoice(editId)
      .then(r => {
        const inv = r.data;
        const rows = (inv.rows||[]).filter(r => r.itemName || r.qty || r.rate || r.amount);
        setForm({ ...inv, rows: rows.length > 0 ? rows : [emptyRow()], _id: inv._id });
      })
      .catch(e => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [editId]);

  const handleSave = async (andPrint=false) => {
    if (!form.invoiceNo.trim()) { toast("Invoice number is required", "error"); return; }
    setSaving(true);
    try {
      if (form._id) {
        await api.updateInvoice(form._id, form);
        toast("Invoice updated!", "success");
      } else {
        const res = await api.createInvoice(form);
        setForm(f => ({ ...f, _id: res.data._id }));
        toast("Invoice saved!", "success");
      }
      if (andPrint) {
        setTab("preview");
        setTimeout(() => handlePrint(true), 400);
      } else {
        onDone();
      }
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  // commitAfterPrint: true only when called from "Save & Print" flow for a NEW invoice
  const handlePrint = (commitAfterPrint=false) => {
    const el = document.getElementById("invoice-print-area");
    if (!el) { toast("Switch to Preview tab first to print", "info"); return; }
    const w = window.open("","_blank");
    w.document.write(`<!DOCTYPE html><html><head><title>Invoice ${form?.invoiceNo || ''} – Chirag Traders</title>
    <style>
      * { 
        -webkit-print-color-adjust: exact !important; 
        print-color-adjust: exact !important; 
        color-adjust: exact !important; 
        box-sizing: border-box;
      }
      body { 
        margin: 0; 
        padding: 0; 
        font-family: Arial, sans-serif; 
        background: #555;
        display: flex;
        justify-content: center;
      }
      @page { 
        size: A4; 
        margin: 0; 
      }
      @media print { 
        body { background: #fff; display: block; }
        .page-container {
           box-shadow: none !important;
           margin: 0 !important;
           width: 100% !important;
        }
      }
    </style>
    </head><body>${el.outerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => {
      w.focus();
      w.print();
      w.close();
      // Commit sequence only for new invoices after successful print
      if (commitAfterPrint && form._invoiceSeq && !editId) {
        commitSequence(form._invoiceSeq);
      }
    }, 500);
  };

  if (loading) return <div style={{ textAlign:"center", padding:60, color:"#9ca3af", fontSize:15 }}>Loading invoice…</div>;

  const TabBtn = ({ id, label }) => (
    <button onClick={()=>setTab(id)} style={{
      padding:"9px 20px", borderRadius:8, border:"none", cursor:"pointer",
      fontWeight:700, fontSize:13,
      background: tab===id ? "#1a3a7a" : "#f3f4f6",
      color:      tab===id ? "#fff"    : "#374151",
    }}>{label}</button>
  );

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display:"flex", gap:10, marginBottom:20, alignItems:"center", flexWrap:"wrap" }}>
        <div style={{ display:"flex", gap:8 }}>
          <TabBtn id="form"    label="📝 Fill Invoice" />
          <TabBtn id="preview" label="👁️ Preview" />
        </div>
        <div style={{ flex:1 }} />
        <button style={{ ...S.btn("ghost"), fontSize:13 }} onClick={onDone}>← Back to History</button>
        <button style={{ ...S.btn("success"), fontSize:13 }} disabled={saving}
          onClick={() => handleSave(false)}>{saving ? "Saving…" : form._id ? "💾 Update" : "💾 Save"}</button>
        <button style={{ ...S.btn("primary"), fontSize:13 }} disabled={saving}
          onClick={() => handleSave(true)}>
          🖨️ Save &amp; Print
        </button>
      </div>

      {tab === "form"    && <InvoiceForm form={form} setForm={setForm} />}
      {tab === "preview" && (
        <div>
          <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12 }}>
            <button style={{ ...S.btn("primary") }} onClick={()=>handlePrint(false)}>🖨️ Print Invoice</button>
          </div>
          <InvoicePreview form={form} />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// VIEW-ONLY PAGE
// ═══════════════════════════════════════════════════════════════════════════
function ViewPage({ invoiceId, onBack, onEdit, toast }) {
  const [form, setForm]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getInvoice(invoiceId)
      .then(r => {
        const inv = r.data;
        const rows = (inv.rows||[]).filter(r => r.itemName || r.qty || r.rate || r.amount);
        setForm({ ...inv, rows: rows.length > 0 ? rows : [emptyRow()] });
      })
      .catch(e => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [invoiceId]);

  const handlePrint = () => {
    const el = document.getElementById("invoice-print-area");
    if (!el) return;
    const w = window.open("","_blank");
    w.document.write(`<!DOCTYPE html><html><head><title>Invoice ${form?.invoiceNo || ''} – Chirag Traders</title>
    <style>
      * { 
        -webkit-print-color-adjust: exact !important; 
        print-color-adjust: exact !important; 
        color-adjust: exact !important; 
        box-sizing: border-box;
      }
      body { 
        margin: 0; 
        padding: 0; 
        font-family: Arial, sans-serif; 
        background: #555;
        display: flex;
        justify-content: center;
      }
      @page { 
        size: A4; 
        margin: 0; 
      }
      @media print { 
        body { background: #fff; display: block; }
        .page-container {
           box-shadow: none !important;
           margin: 0 !important;
           width: 100% !important;
        }
      }
    </style>
    </head><body>${el.outerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); w.close(); }, 500);
  };

  if (loading) return <div style={{ textAlign:"center", padding:60, color:"#9ca3af" }}>Loading…</div>;
  if (!form)   return <div style={{ textAlign:"center", padding:60, color:"#9ca3af" }}>Invoice not found.</div>;

  return (
    <div>
      <div style={{ display:"flex", gap:10, marginBottom:20, alignItems:"center" }}>
        <button style={S.btn("ghost")} onClick={onBack}>← Back</button>
        <button style={S.btn("outline")} onClick={()=>onEdit(invoiceId)}>✏️ Edit</button>
        <div style={{ flex:1 }} />
        <button style={S.btn("primary")} onClick={handlePrint}>🖨️ Print Invoice</button>
      </div>
      <InvoicePreview form={form} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [page,    setPage]    = useState("history");
  const [editId,  setEditId]  = useState(null);
  const [viewId,  setViewId]  = useState(null);
  const [toast,   setToast]   = useState({ msg:"", type:"info" });

  const showToast = (msg, type="info") => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg:"", type:"info" }), 2800);
  };

  const navItems = [
    { id:"history", label:"Invoice History", icon:"🗂️" },
    { id:"create",  label:"New Invoice",      icon:"➕" },
    { id:"items",   label:"Manage Items",     icon:"📦" },
  ];

  const NavEl = () => (
    <nav style={S.sidebar}>
      {/* Logo */}
      <div style={{ padding:"18px 16px 14px", borderBottom:"1px solid #e5e7eb" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <img src={logo} alt="Chirag Traders" style={{ width:36, height:36, objectFit:"contain" }} />
          <div>
            <div style={{ fontWeight:800, fontSize:14, color:"#1a3a7a" }}>Chirag Traders</div>
            <div style={{ fontSize:10, color:"#9ca3af" }}>Invoice Manager</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ padding:"10px 0", flex:1 }}>
        {navItems.map(({ id, label, icon }) => (
          <div key={id} style={S.navItem(page===id || (page==="edit"&&id==="history") || (page==="view"&&id==="history"))}
            onClick={() => { if(id==="create"){ setEditId(null); } setPage(id); }}>
            <span style={{ fontSize:18 }}>{icon}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding:"12px 16px", borderTop:"1px solid #e5e7eb", fontSize:11, color:"#9ca3af" }}>
        <div style={{ fontWeight:600 }}>Rice &amp; Dal Business</div>
        <div>Kolkata 700006</div>
      </div>
    </nav>
  );

  return (
    <div style={S.app}>
      <Toast msg={toast.msg} type={toast.type} />

      {/* Top Bar */}
      <div style={S.topbar}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <img src={logo} alt="Chirag Traders" style={{ width:36, height:36, objectFit:"contain" }} />
          <div>
            <div style={{ fontWeight:800, fontSize:16, letterSpacing:0.5 }}>CHIRAG TRADERS</div>
            <div style={{ fontSize:10, opacity:0.7, letterSpacing:1 }}>Invoice Management System</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <span style={{ fontSize:12, opacity:0.7 }}>
            {page==="history" ? "Invoice History" : page==="create" ? "New Invoice" :
             page==="edit"    ? "Edit Invoice"    : page==="items" ? "Manage Items" : "View Invoice"}
          </span>
          <button style={{ ...S.btn("white"), padding:"7px 16px" }}
            onClick={() => { setEditId(null); setPage("create"); }}>
            + New Invoice
          </button>
        </div>
      </div>

      {/* Layout */}
      <div style={S.main}>
        <NavEl />
        <div style={S.content}>
          {page === "history" && (
            <HistoryPage
              toast={showToast}
              onEdit={id => { setEditId(id); setPage("edit"); }}
              onView={id => { setViewId(id); setPage("view"); }} />
          )}
          {(page === "create" || page === "edit") && (
            <CreateEditPage
              editId={page==="edit" ? editId : null}
              toast={showToast}
              onDone={() => setPage("history")} />
          )}
          {page === "items" && (
            <ItemsPage toast={showToast} />
          )}
          {page === "view" && (
            <ViewPage
              invoiceId={viewId}
              toast={showToast}
              onBack={() => setPage("history")}
              onEdit={id => { setEditId(id); setPage("edit"); }} />
          )}
        </div>
      </div>
    </div>
  );
}