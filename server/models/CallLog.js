const mongoose = require("mongoose");

const callLogSchema = new mongoose.Schema(
  {
    deviceCallId: {
      type: String,
      required: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      default: "",
      trim: true,
    },
    type: {
      type: String,
      enum: [
        "INCOMING",
        "OUTGOING",
        "MISSED",
        "REJECTED",
        "BLOCKED",
        "VOICEMAIL",
        "UNKNOWN",
      ],
      required: true,
    },
    dateTimestamp: {
      type: Number,
      required: true,
    },
    duration: {
      type: Number,
      default: 0,
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

// Compound index: one entry per call record per device
callLogSchema.index({ deviceCallId: 1, deviceId: 1 }, { unique: true });

module.exports = mongoose.model("CallLog", callLogSchema);

