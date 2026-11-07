require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const contactsRoutes = require("./routes/contacts");
const callLogsRoutes = require("./routes/callLogs");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use("/api/contacts", contactsRoutes);
app.use("/api/call-logs", callLogsRoutes);

// Health check
app.get("/", (_req, res) => {
  res.json({ status: "ok", message: "HelpBot API is running" });
});

// ─── Database & Server ───────────────────────────────────────────────────────
const MONGO_URL = process.env.MONGO_URL;
const DB_NAME = process.env.DB_NAME || "HelpBot";

if (!MONGO_URL) {
  console.error("MONGO_URL is not set in .env");
  process.exit(1);
}

mongoose
  .connect(MONGO_URL, { dbName: DB_NAME })
  .then(() => {
    console.log(`Connected to MongoDB (database: ${DB_NAME})`);
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });

