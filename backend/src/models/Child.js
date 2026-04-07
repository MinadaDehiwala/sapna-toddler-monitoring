const mongoose = require('mongoose');

const ChildSchema = new mongoose.Schema(
  {
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent', required: true, index: true },
    nickname: { type: String, required: true, trim: true },
    dateOfBirth: { type: Date, required: true },
    sex: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer_not_to_say', ''],
      default: ''
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Child', ChildSchema);
