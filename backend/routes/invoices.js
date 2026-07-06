const express = require("express");
const router = express.Router();
const Invoice = require("../models/Invoice");

// ─── Helpers ────────────────────────────────────────────────────────────────
function calcGrandTotal(body) {
  const rows = body.rows || [];
  const subTotal = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const discount = parseFloat(body.discount) || 0;
  const taxable = subTotal - discount;
  const sgst = taxable * (parseFloat(body.sgstPct) || 0) / 100;
  const cgst = taxable * (parseFloat(body.cgstPct) || 0) / 100;
  return Math.round(taxable + sgst + cgst);
}

// ─── GET /api/invoices ───────────────────────────────────────────────────────
// Query params: search, dateFrom, dateTo, page, limit, sortBy, order
router.get("/", async (req, res) => {
  try {
    const {
      search = "",
      dateFrom = "",
      dateTo = "",
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      order = "desc",
    } = req.query;

    const query = {};

    // Full-text search across invoiceNo, customerName, mobile, item names
    if (search.trim()) {
      query.$or = [
        { invoiceNo:    { $regex: search, $options: "i" } },
        { customerName: { $regex: search, $options: "i" } },
        { mobile:       { $regex: search, $options: "i" } },
        { "rows.itemName": { $regex: search, $options: "i" } },
      ];
    }

    // Date range filter (stored as "YYYY-MM-DD" strings)
    if (dateFrom || dateTo) {
      query.date = {};
      if (dateFrom) query.date.$gte = dateFrom;
      if (dateTo)   query.date.$lte = dateTo;
    }

    const sortOrder = order === "asc" ? 1 : -1;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(parseInt(limit))
        .select("-rows"),          // don't send all rows in list view (perf)
      Invoice.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: invoices,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/invoices/stats ─────────────────────────────────────────────────
router.get("/stats", async (req, res) => {
  try {
    const [totalCount, totalRevenue, todayCount] = await Promise.all([
      Invoice.countDocuments(),
      Invoice.aggregate([{ $group: { _id: null, total: { $sum: "$grandTotal" } } }]),
      Invoice.countDocuments({ date: new Date().toISOString().slice(0, 10) }),
    ]);

    const thisMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    const monthlyRevenue = await Invoice.aggregate([
      { $match: { date: { $regex: `^${thisMonth}` } } },
      { $group: { _id: null, total: { $sum: "$grandTotal" } } },
    ]);

    res.json({
      success: true,
      data: {
        totalInvoices:   totalCount,
        totalRevenue:    totalRevenue[0]?.total || 0,
        todayInvoices:   todayCount,
        monthlyRevenue:  monthlyRevenue[0]?.total || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/invoices/:id ───────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });
    res.json({ success: true, data: invoice });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/invoices ──────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const existing = await Invoice.findOne({ invoiceNo: req.body.invoiceNo });
    if (existing) {
      return res.status(409).json({ success: false, message: `Invoice #${req.body.invoiceNo} already exists. Use PUT to update.` });
    }
    const grandTotal = calcGrandTotal(req.body);
    const invoice = new Invoice({ ...req.body, grandTotal });
    await invoice.save();
    res.status(201).json({ success: true, data: invoice });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: "Duplicate invoice number." });
    }
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── PUT /api/invoices/:id ───────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const grandTotal = calcGrandTotal(req.body);
    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      { ...req.body, grandTotal },
      { new: true, runValidators: true }
    );
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });
    res.json({ success: true, data: invoice });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── DELETE /api/invoices/:id ────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const invoice = await Invoice.findByIdAndDelete(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });
    res.json({ success: true, message: "Invoice deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
