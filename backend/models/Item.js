const mongoose = require("mongoose");

const ItemSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true, uppercase: true },  // e.g. "PERBOILED RICE(26KG)"
  brand:    { type: String, required: true, trim: true, uppercase: true },  // e.g. "DOUBLE DEER"
  hsnCode:  { type: String, default: "", trim: true },                      // e.g. "10063020"
}, {
  timestamps: true, // adds createdAt & updatedAt
});

// Prevent duplicate rice-name + brand combinations
ItemSchema.index({ name: 1, brand: 1 }, { unique: true });

module.exports = mongoose.model("Item", ItemSchema);
