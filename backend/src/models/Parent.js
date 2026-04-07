const mongoose = require('mongoose');

const ParentSchema = new mongoose.Schema(
  {
    firebaseUid: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    displayName: { type: String, trim: true, default: '' },
    hasAcceptedConsent: { type: Boolean, default: false },
    consentAcceptedAt: { type: Date, default: null },
    consentAcknowledgedScreeningOnly: { type: Boolean, default: false },
    consentAcknowledgedDataUse: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Parent', ParentSchema);
