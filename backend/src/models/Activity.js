const mongoose = require('mongoose');

const ActivitySchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    domain: {
      type: String,
      required: true,
      enum: ['cognitive', 'motor', 'language', 'social_emotional']
    },
    ageBandMinMonths: { type: Number, required: true, min: 0 },
    ageBandMaxMonths: { type: Number, required: true, min: 1 },
    estimatedMinutes: { type: Number, required: true, min: 1 },
    instructions: [{ type: String, trim: true }],
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Activity', ActivitySchema);
