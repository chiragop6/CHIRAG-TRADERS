const mongoose = require("mongoose");

const InvoiceRowSchema = new mongoose.Schema({
  itemName:  { type: String, default: "" },
  hsnCode:   { type: String, default: "" },
  qty:       { type: String, default: "" },
  altQty:    { type: String, default: "" },
  unit:      { type: String, default: "" },
  rate:      { type: String, default: "" },
  amount:    { type: String, default: "" },
}, { _id: false });

const InvoiceSchema = new mongoose.Schema({
  invoiceNo:      { type: String, required: true, trim: true },
  date:           { type: String, default: "" },
  gstin:          { type: String, default: "" },

  // Customer
  customerName:   { type: String, default: "", index: true },
  address:        { type: String, default: "" },
  mobile:         { type: String, default: "" },
  customerGstin:  { type: String, default: "" },

  // Items
  rows:           { type: [InvoiceRowSchema], default: [] },

  // Totals
  discount:       { type: String, default: "0" },
  sgstPct:        { type: String, default: "0" },
  cgstPct:        { type: String, default: "0" },
  grandTotal:     { type: Number, default: 0 },

  notes:          { type: String, default: "" },
  status:         { type: String, enum: ["draft", "final"], default: "final" },
}, {
  timestamps: true,  // adds createdAt & updatedAt
});

// Text index for full-text search
InvoiceSchema.index({ invoiceNo: "text", customerName: "text", mobile: "text", "rows.itemName": "text" });
InvoiceSchema.index({ date: 1 });
InvoiceSchema.index({ grandTotal: 1 });

module.exports = mongoose.model("Invoice", InvoiceSchema);
