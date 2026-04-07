const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema(
  {
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent', required: true, index: true },
    childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Child', required: true, index: true },
    activityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Activity', required: true },
    completedAt: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, required: true, min: 0, max: 240 },
    successLevel: {
      type: String,
      required: true,
      enum: ['needs_help', 'partial', 'completed', 'mastered']
    },
    parentConfidence: { type: Number, required: true, min: 1, max: 5 },
    notes: { type: String, trim: true, maxlength: 1000 }
  },
  { timestamps: true }
);

ActivityLogSchema.index({ childId: 1, completedAt: -1 });

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);
