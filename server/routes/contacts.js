const express = require("express");
const Contact = require("../models/Contact");

const router = express.Router();

// POST /api/contacts/sync — Bulk upsert contacts from a device
router.post("/sync", async (req, res) => {
  try {
    const { deviceId, contacts } = req.body;

    if (!deviceId || !Array.isArray(contacts)) {
      return res.status(400).json({
        success: false,
        message: "deviceId (string) and contacts (array) are required.",
      });
    }

    const operations = contacts.map((contact) => ({
      updateOne: {
        filter: {
          deviceContactId: contact.id,
          deviceId,
        },
        update: {
          $set: {
            deviceContactId: contact.id,
            name: contact.name,
            phoneNumber: contact.phoneNumber,
            photoUri: contact.photoUri || null,
            deviceId,
          },
        },
        upsert: true,
      },
    }));

    let result = { upsertedCount: 0, modifiedCount: 0 };
    if (operations.length > 0) {
      result = await Contact.bulkWrite(operations);
    }

    res.json({
      success: true,
      message: `Synced ${contacts.length} contacts.`,
      upserted: result.upsertedCount,
      updated: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error syncing contacts:", error);
    res.status(500).json({
      success: false,
      message: "Failed to sync contacts.",
      error: error.message,
    });
  }
});

// GET /api/contacts — Get all contacts, optionally filtered by deviceId
router.get("/", async (req, res) => {
  try {
    const { deviceId } = req.query;
    const filter = deviceId ? { deviceId } : {};
    const contacts = await Contact.find(filter).sort({ name: 1 });

    res.json({
      success: true,
      count: contacts.length,
      data: contacts,
    });
  } catch (error) {
    console.error("Error fetching contacts:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch contacts.",
      error: error.message,
    });
  }
});

module.exports = router;

