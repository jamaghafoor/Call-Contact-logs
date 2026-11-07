const express = require("express");
const CallLog = require("../models/CallLog");

const router = express.Router();

// POST /api/call-logs/sync — Bulk upsert call logs from a device
router.post("/sync", async (req, res) => {
  try {
    const { deviceId, callLogs } = req.body;

    if (!deviceId || !Array.isArray(callLogs)) {
      return res.status(400).json({
        success: false,
        message: "deviceId (string) and callLogs (array) are required.",
      });
    }

    const operations = callLogs.map((log) => ({
      updateOne: {
        filter: {
          deviceCallId: log.id,
          deviceId,
        },
        update: {
          $set: {
            deviceCallId: log.id,
            phoneNumber: log.phoneNumber,
            name: log.name || "",
            type: log.type,
            dateTimestamp: log.dateTimestamp,
            duration: log.duration || 0,
            deviceId,
          },
        },
        upsert: true,
      },
    }));

    let result = { upsertedCount: 0, modifiedCount: 0 };
    if (operations.length > 0) {
      result = await CallLog.bulkWrite(operations);
    }

    res.json({
      success: true,
      message: `Synced ${callLogs.length} call logs.`,
      upserted: result.upsertedCount,
      updated: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error syncing call logs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to sync call logs.",
      error: error.message,
    });
  }
});

// GET /api/call-logs — Get all call logs, optionally filtered by deviceId
router.get("/", async (req, res) => {
  try {
    const { deviceId } = req.query;
    const filter = deviceId ? { deviceId } : {};
    const callLogs = await CallLog.find(filter).sort({ dateTimestamp: -1 });

    res.json({
      success: true,
      count: callLogs.length,
      data: callLogs,
    });
  } catch (error) {
    console.error("Error fetching call logs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch call logs.",
      error: error.message,
    });
  }
});

module.exports = router;

