const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
  {
    deviceContactId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },
    photoUri: {
      type: String,
      default: null,
    },
    deviceId: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index: one entry per contact per device
contactSchema.index({ deviceContactId: 1, deviceId: 1 }, { unique: true });

module.exports = mongoose.model("Contact", contactSchema);

