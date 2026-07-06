// One-time script to prefill the Items table with your existing rice names,
// brands, and HSN codes. Run with: node scripts/seedItems.js
//
// HSN codes used (standard GST classification for rice, chapter 1006):
//   10063010 -> Basmati rice
//   10063020 -> Parboiled rice (non-basmati) — also used for Miniket, which is parboiled
//   10063090 -> Other semi/wholly-milled rice (used here for Raw Rice)
// Double-check these against your GST filings/CA's advice before relying on them.

require("dotenv").config();
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const mongoose = require("mongoose");
const Item = require("../models/Item");

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/chirag_traders";

const SEED_ITEMS = [
  { name: "PERBOILED RICE(26KG)", brand: "DOUBLE DEER",     hsnCode: "10063020" },
  { name: "PERBOILED RICE(26KG)", brand: "SHAHENSHA",       hsnCode: "10063020" },
  { name: "BASMATI RICE(30KG)",   brand: "BADAL ORANGE",    hsnCode: "10063010" },
  { name: "RAW RICE(26KG)",       brand: "FIVE STAR",       hsnCode: "10063090" },
  { name: "PERBOILED RICE(26KG)", brand: "VEER PERFECT",    hsnCode: "10063020" },
  { name: "PERBOILED RICE(26KG)", brand: "VEER SAI PAKVAN", hsnCode: "10063020" },
  { name: "BASMATI RICE(30KG)",   brand: "GARIMA GOLD",     hsnCode: "10063010" },
  { name: "PERBOILED RICE(26KG)", brand: "VEER SUPREME",    hsnCode: "10063020" },
  { name: "PERBOILED RICE(26KG)", brand: "DILSAR MAGIC",    hsnCode: "10063020" },
  { name: "MINIKET RICE(25KG)",   brand: "RIPURAJ GREEN",   hsnCode: "10063020" },
  { name: "PERBOILED RICE(26KG)", brand: "WAZER",           hsnCode: "10063020" },
  { name: "BASMATI RICE(30KG)",   brand: "GARIMA ROYAL",    hsnCode: "10063010" },
  { name: "BASMATI RICE(30KG)",   brand: "RAJ BHOG",        hsnCode: "10063010" },
  { name: "PERBOILED RICE(26KG)", brand: "BADAL BLUE",      hsnCode: "10063020" },
  { name: "MINIKET RICE(25KG)",   brand: "BHARAT MINIKET",  hsnCode: "10063020" },
  { name: "MINIKET RICE(25KG)",   brand: "JASHAN GREEN",    hsnCode: "10063020" },
  { name: "MINIKET RICE(25KG)",   brand: "ATITHI MINIKET",  hsnCode: "10063020" },
];

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");

  for (const it of SEED_ITEMS) {
    await Item.updateOne(
      { name: it.name, brand: it.brand },
      { $setOnInsert: it },
      { upsert: true }
    );
  }

  console.log(`Seeded ${SEED_ITEMS.length} items (existing ones were left untouched).`);
  await mongoose.disconnect();
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});