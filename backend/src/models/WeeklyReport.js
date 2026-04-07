const mongoose = require('mongoose');

const WeeklyReportSchema = new mongoose.Schema(
  {
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent', required: true, index: true },
    childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Child', required: true, index: true },
    weekStart: { type: Date, required: true, index: true },
    weekEnd: { type: Date, required: true },
    generatedAt: { type: Date, required: true, default: Date.now },
    status: {
      type: String,
      enum: ['on_track', 'needs_monitoring', 'at_risk'],
      required: true
    },
    summary: { type: String, required: true },
    recommendations: [{ type: String, trim: true }],
    riskFlags: [{ type: String, trim: true }],
    topRiskFactors: [{ type: String, trim: true }],
    predictionSource: {
      type: String,
      enum: ['ml', 'rules_fallback'],
      default: 'rules_fallback',
      required: true
    },
    predictionConfidence: { type: Number, default: 0 },
    modelVersion: { type: String, default: 'sapna-rules-v1' },
    classProbabilities: {
      on_track: { type: Number, default: 0 },
      needs_monitoring: { type: Number, default: 0 },
      at_risk: { type: Number, default: 0 }
    },
    domainBreakdown: {
      cognitive: { type: Number, default: 0 },
      motor: { type: Number, default: 0 },
      language: { type: Number, default: 0 },
      social_emotional: { type: Number, default: 0 }
    },
    reportDisclaimer: { type: String, required: true }
  },
  { timestamps: true }
);

WeeklyReportSchema.index({ childId: 1, weekStart: -1 }, { unique: true });

module.exports = mongoose.model('WeeklyReport', WeeklyReportSchema);
