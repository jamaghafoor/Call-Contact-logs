require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const contactsRoutes = require("./routes/contacts");
const callLogsRoutes = require("./routes/callLogs");

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ─── Database Connection (Cached for Serverless) ──────────────────────────────
const MONGO_URL = process.env.MONGO_URL;
const DB_NAME = process.env.DB_NAME || "HelpBot";

let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb && mongoose.connection.readyState === 1) {
    return cachedDb;
  }

  if (!MONGO_URL) {
    throw new Error("MONGO_URL environment variable is not defined");
  }

  cachedDb = await mongoose.connect(MONGO_URL, {
    dbName: DB_NAME,
  });
  return cachedDb;
}

// Ensure database is connected before handling any route
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (err) {
    console.error("Database connection error:", err.message);
    res.status(500).json({
      success: false,
      message: "Database connection failed",
      error: err.message,
    });
  }
});

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use("/api/contacts", contactsRoutes);
app.use("/api/call-logs", callLogsRoutes);

// Health check
app.get("/", (_req, res) => {
  res.json({ status: "ok", message: "HelpBot API is running" });
});

// ─── Local Development Server ────────────────────────────────────────────────
// When running locally (not on Vercel), listen on PORT
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  connectToDatabase()
    .then(() => {
      console.log(`Connected to MongoDB (database: ${DB_NAME})`);
      app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error("MongoDB initial connection error:", err.message);
    });
}

// Export the Express app for Vercel Serverless Function
module.exports = app;
