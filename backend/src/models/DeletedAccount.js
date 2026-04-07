const mongoose = require('mongoose');

const DeletedAccountSchema = new mongoose.Schema(
  {
    firebaseUid: { type: String, required: true, unique: true, index: true },
    deletedAt: { type: Date, required: true },
    reason: { type: String, trim: true, default: 'parent_requested' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('DeletedAccount', DeletedAccountSchema);
