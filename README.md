# Chirag Traders – Invoice Management System

Full-stack invoice manager: React frontend + Node/Express backend + MongoDB.

---

## Project Structure

```
chirag-traders/
├── backend/
│   ├── models/
│   │   └── Invoice.js          ← Mongoose schema
│   ├── routes/
│   │   └── invoices.js         ← All API routes
│   ├── server.js               ← Express app + MongoDB connect
│   ├── package.json
│   └── .env.example            ← Copy to .env and fill in
└── frontend/
    ├── public/
    │   └── index.html
    ├── src/
    │   ├── services/
    │   │   └── api.js          ← API calls
    │   ├── App.jsx             ← Full UI (form, history, preview)
    │   └── index.js
    └── package.json
```

---

## Setup Instructions

### 1. Backend

```bash
cd backend
npm install

# Copy env file and edit it
cp .env.example .env
# Set MONGODB_URI in .env

npm run dev      # development (nodemon)
# or
npm start        # production
```

Backend runs at: `http://localhost:5000`

### 2. Frontend

```bash
cd frontend
npm install
npm start
```

Frontend runs at: `http://localhost:3000`  
The `"proxy": "http://localhost:5000"` in `package.json` forwards `/api/*` requests automatically.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/invoices` | List invoices (search, date filter, pagination) |
| GET | `/api/invoices/stats` | Dashboard stats (totals, revenue) |
| GET | `/api/invoices/:id` | Single invoice with all rows |
| POST | `/api/invoices` | Create new invoice |
| PUT | `/api/invoices/:id` | Update existing invoice |
| DELETE | `/api/invoices/:id` | Delete invoice |

### Query Parameters for GET /api/invoices

| Param | Type | Description |
|-------|------|-------------|
| `search` | string | Searches: invoice no, customer name, mobile, vehicle, item names |
| `dateFrom` | YYYY-MM-DD | Filter invoices from this date |
| `dateTo` | YYYY-MM-DD | Filter invoices up to this date |
| `sortBy` | string | `createdAt`, `date`, `grandTotal`, `invoiceNo`, `customerName` |
| `order` | string | `asc` or `desc` |
| `page` | number | Page number (default: 1) |
| `limit` | number | Results per page (default: 20) |

---

## MongoDB Atlas (Cloud)

1. Go to https://cloud.mongodb.com and create a free cluster
2. Create a database user
3. Whitelist your IP (or use 0.0.0.0/0 for development)
4. Click "Connect" → "Drivers" → copy the connection string
5. Paste it in `.env` as `MONGODB_URI`

---

## Features

- ✅ Create, edit, delete invoices
- ✅ 18-row item table with auto amount calculation
- ✅ SGST / CGST / Discount / Round-off
- ✅ Amount in words (Indian format: Lakhs, Crores)
- ✅ Print-ready invoice matching Chirag Traders template
- ✅ Invoice history with search (customer, invoice no, mobile, items)
- ✅ Date range filter
- ✅ Sort by amount, date, customer, invoice no
- ✅ Pagination
- ✅ Dashboard stats: total invoices, total revenue, monthly revenue, today's count
- ✅ Toast notifications
