const express = require("express");
const router = express.Router();
const Item = require("../models/Item");

// GET /api/items — list all items, alphabetical by rice name then brand
router.get("/", async (req, res) => {
  try {
    const items = await Item.find().sort({ name: 1, brand: 1 });
    res.json({ data: items });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/items — add a new rice name + brand (+ optional HSN code)
router.post("/", async (req, res) => {
  try {
    const { name, brand, hsnCode } = req.body;
    if (!name || !brand) {
      return res.status(400).json({ message: "Rice name and brand are required" });
    }
    const item = await Item.create({ name, brand, hsnCode });
    res.status(201).json({ data: item });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(409).json({ message: "This rice name + brand already exists" });
    }
    res.status(500).json({ message: e.message });
  }
});

// PUT /api/items/:id — edit an existing item
router.put("/:id", async (req, res) => {
  try {
    const { name, brand, hsnCode } = req.body;
    const item = await Item.findByIdAndUpdate(
      req.params.id,
      { name, brand, hsnCode },
      { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ message: "Item not found" });
    res.json({ data: item });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(409).json({ message: "This rice name + brand already exists" });
    }
    res.status(500).json({ message: e.message });
  }
});

// DELETE /api/items/:id
router.delete("/:id", async (req, res) => {
  try {
    const item = await Item.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: "Item not found" });
    res.json({ data: item });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
