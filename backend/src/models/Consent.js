const mongoose = require('mongoose');

const ConsentSchema = new mongoose.Schema(
  {
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent', required: true, index: true },
    version: { type: String, required: true },
    acceptedAt: { type: Date, required: true },
    acknowledgedScreeningOnly: { type: Boolean, required: true },
    acknowledgedDataUse: { type: Boolean, required: true },
    userAgent: { type: String, trim: true, default: '' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Consent', ConsentSchema);
