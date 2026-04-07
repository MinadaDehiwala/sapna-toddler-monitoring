const { startOfWeek, endOfWeek } = require('date-fns');
const ActivityLog = require('../models/ActivityLog');
const WeeklyReport = require('../models/WeeklyReport');
const Child = require('../models/Child');
const { env } = require('../config/env');
const { calculateAgeInMonths } = require('../utils/age');
const { getBaselineByAge, scoreFromSuccessLevel } = require('./milestoneRules');

function round(num) {
  return Number(num.toFixed(2));
}

function buildRecommendations(domainBreakdown, baseline) {
  const recommendations = [];

  Object.entries(domainBreakdown).forEach(([domain, score]) => {
    if (score < 0.55) {
      const focus = baseline?.domainFocus?.[domain] || 'Increase parent-guided offline play frequency.';
      recommendations.push(`${domain.replace('_', ' ')} support: ${focus}`);
    }
  });

  if (recommendations.length === 0) {
    recommendations.push('Maintain consistent daily offline interactions and continue milestone logging.');
  }

  return recommendations;
}

function deriveStatus(overallScore, totalLogs) {
  if (totalLogs < 2) {
    return 'needs_monitoring';
  }

  if (overallScore < 0.45) {
    return 'at_risk';
  }

  if (overallScore < 0.7) {
    return 'needs_monitoring';
  }

  return 'on_track';
}

function buildRiskFlags(totalLogs, averageConfidence, domainBreakdown) {
  const flags = [];

  if (totalLogs < 2) {
    flags.push('Low data volume this week; continue logging to improve confidence.');
  }

  if (averageConfidence < 2.5) {
    flags.push('Parent confidence levels are low; consider repeating guided activities with smaller steps.');
  }

  const weakDomains = Object.entries(domainBreakdown)
    .filter(([, value]) => value < 0.45)
    .map(([domain]) => domain.replace('_', ' '));

  if (weakDomains.length > 0) {
    flags.push(`Possible delay signal in: ${weakDomains.join(', ')}.`);
  }

  return flags;
}

async function generateWeeklyReport({ parentId, childId, referenceDate = new Date() }) {
  const child = await Child.findOne({ _id: childId, parentId });

  if (!child) {
    const error = new Error('Child not found for this parent.');
    error.status = 404;
    throw error;
  }

  const weekStart = startOfWeek(referenceDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(referenceDate, { weekStartsOn: 1 });

  const logs = await ActivityLog.find({
    childId,
    parentId,
    completedAt: { $gte: weekStart, $lte: weekEnd }
  }).populate('activityId');

  const domainAccumulator = {
    cognitive: [],
    motor: [],
    language: [],
    social_emotional: []
  };

  let confidenceSum = 0;

  logs.forEach((log) => {
    const activityDomain = log.activityId?.domain;
    if (activityDomain && domainAccumulator[activityDomain]) {
      domainAccumulator[activityDomain].push(scoreFromSuccessLevel(log.successLevel));
    }
    confidenceSum += log.parentConfidence;
  });

  const domainBreakdown = {
    cognitive: round(
      domainAccumulator.cognitive.length
        ? domainAccumulator.cognitive.reduce((a, b) => a + b, 0) / domainAccumulator.cognitive.length
        : 0
    ),
    motor: round(
      domainAccumulator.motor.length
        ? domainAccumulator.motor.reduce((a, b) => a + b, 0) / domainAccumulator.motor.length
        : 0
    ),
    language: round(
      domainAccumulator.language.length
        ? domainAccumulator.language.reduce((a, b) => a + b, 0) / domainAccumulator.language.length
        : 0
    ),
    social_emotional: round(
      domainAccumulator.social_emotional.length
        ? domainAccumulator.social_emotional.reduce((a, b) => a + b, 0) /
          domainAccumulator.social_emotional.length
        : 0
    )
  };

  const nonZeroDomainScores = Object.values(domainBreakdown).filter((value) => value > 0);
  const overallScore = round(
    nonZeroDomainScores.length
      ? nonZeroDomainScores.reduce((a, b) => a + b, 0) / nonZeroDomainScores.length
      : 0
  );

  const averageConfidence = logs.length ? confidenceSum / logs.length : 0;
  const status = deriveStatus(overallScore, logs.length);
  const ageInMonths = calculateAgeInMonths(child.dateOfBirth, referenceDate);
  const baseline = getBaselineByAge(ageInMonths);
  const recommendations = buildRecommendations(domainBreakdown, baseline);
  const riskFlags = buildRiskFlags(logs.length, averageConfidence, domainBreakdown);

  const summary =
    status === 'on_track'
      ? 'Progress appears on track this week based on parent-logged interactions.'
      : status === 'needs_monitoring'
        ? 'Some milestones need closer monitoring. Continue guided activities and regular logging.'
        : 'Multiple indicators suggest elevated developmental risk; seek professional clinical advice promptly.';

  const report = await WeeklyReport.findOneAndUpdate(
    { childId, parentId, weekStart },
    {
      $set: {
        weekEnd,
        generatedAt: new Date(),
        status,
        summary,
        recommendations,
        riskFlags,
        domainBreakdown,
        reportDisclaimer: env.reportDisclaimer
      }
    },
    { upsert: true, new: true }
  );

  return report;
}

module.exports = { generateWeeklyReport };
