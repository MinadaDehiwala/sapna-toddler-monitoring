const { startOfWeek, endOfWeek } = require('date-fns');
const ActivityLog = require('../models/ActivityLog');
const WeeklyReport = require('../models/WeeklyReport');
const Child = require('../models/Child');
const { env } = require('../config/env');
const { calculateAgeInMonths } = require('../utils/age');
const { getBaselineByAge, scoreFromSuccessLevel } = require('./milestoneRules');
const {
  DOMAINS,
  buildMlFeatureSet,
  deriveHeuristicRiskFactors,
  buildFallbackProbabilities
} = require('./mlFeatureBuilder');
const { getMlPrediction, isMlEnabled } = require('./mlService');

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

function buildSummary(status, predictionSource) {
  const baseSummary =
    status === 'on_track'
      ? 'Progress appears on track this week based on parent-logged interactions.'
      : status === 'needs_monitoring'
        ? 'Some milestones need closer monitoring. Continue guided activities and regular logging.'
        : 'Multiple indicators suggest elevated developmental risk; seek professional clinical advice promptly.';

  if (predictionSource === 'rules_fallback') {
    return `${baseSummary} This report used the rules fallback because the ML service was unavailable or not confident enough.`;
  }

  return baseSummary;
}

function buildWeeklyAnalytics(logs) {
  const domainAccumulator = Object.fromEntries(DOMAINS.map((domain) => [domain, []]));
  let confidenceSum = 0;

  logs.forEach((log) => {
    const activityDomain = log.activityId?.domain;
    if (activityDomain && domainAccumulator[activityDomain]) {
      domainAccumulator[activityDomain].push(scoreFromSuccessLevel(log.successLevel));
    }
    confidenceSum += Number(log.parentConfidence || 0);
  });

  const domainBreakdown = Object.fromEntries(
    DOMAINS.map((domain) => {
      const scores = domainAccumulator[domain];
      const average = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 0;
      return [domain, round(average)];
    })
  );

  const nonZeroDomainScores = Object.values(domainBreakdown).filter((value) => value > 0);
  const overallScore = round(
    nonZeroDomainScores.length
      ? nonZeroDomainScores.reduce((sum, value) => sum + value, 0) / nonZeroDomainScores.length
      : 0
  );

  return {
    domainBreakdown,
    overallScore,
    averageConfidence: logs.length ? confidenceSum / logs.length : 0,
    totalLogs: logs.length
  };
}

async function resolvePrediction({ features, fallbackStatus, overallScore, totalLogs }) {
  const fallbackProbabilities = buildFallbackProbabilities(fallbackStatus, overallScore, totalLogs);
  const fallbackFactors = deriveHeuristicRiskFactors(features, fallbackStatus);

  if (!isMlEnabled()) {
    return {
      status: fallbackStatus,
      predictionSource: 'rules_fallback',
      predictionConfidence: fallbackProbabilities[fallbackStatus],
      modelVersion: env.ruleEngineVersion,
      classProbabilities: fallbackProbabilities,
      topRiskFactors: fallbackFactors
    };
  }

  try {
    const prediction = await getMlPrediction(features);
    const confidence = Number(prediction.confidence || 0);
    const shouldFallback = confidence < env.mlConfidenceThreshold;

    return {
      status: shouldFallback ? fallbackStatus : prediction.status,
      predictionSource: shouldFallback ? 'rules_fallback' : 'ml',
      predictionConfidence: shouldFallback ? fallbackProbabilities[fallbackStatus] : confidence,
      modelVersion: prediction.modelVersion || env.ruleEngineVersion,
      classProbabilities: prediction.classProbabilities || fallbackProbabilities,
      topRiskFactors:
        prediction.topRiskFactors?.length && !shouldFallback
          ? prediction.topRiskFactors
          : fallbackFactors
    };
  } catch (error) {
    return {
      status: fallbackStatus,
      predictionSource: 'rules_fallback',
      predictionConfidence: fallbackProbabilities[fallbackStatus],
      modelVersion: env.ruleEngineVersion,
      classProbabilities: fallbackProbabilities,
      topRiskFactors: fallbackFactors,
      predictionError: error.message
    };
  }
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

  const ageInMonths = calculateAgeInMonths(child.dateOfBirth, referenceDate);
  const analytics = buildWeeklyAnalytics(logs);
  const fallbackStatus = deriveStatus(analytics.overallScore, analytics.totalLogs);
  const baseline = getBaselineByAge(ageInMonths);
  const recommendations = buildRecommendations(analytics.domainBreakdown, baseline);
  const riskFlags = buildRiskFlags(
    analytics.totalLogs,
    analytics.averageConfidence,
    analytics.domainBreakdown
  );
  const features = buildMlFeatureSet({ logs, ageInMonths });
  const prediction = await resolvePrediction({
    features,
    fallbackStatus,
    overallScore: analytics.overallScore,
    totalLogs: analytics.totalLogs
  });
  const topRiskFactors = prediction.topRiskFactors || [];
  const summary = buildSummary(prediction.status, prediction.predictionSource);

  const report = await WeeklyReport.findOneAndUpdate(
    { childId, parentId, weekStart },
    {
      $set: {
        weekEnd,
        generatedAt: new Date(),
        status: prediction.status,
        summary,
        recommendations,
        riskFlags: [...new Set([...riskFlags, ...topRiskFactors])],
        topRiskFactors,
        predictionSource: prediction.predictionSource,
        predictionConfidence: round(prediction.predictionConfidence || 0),
        modelVersion: prediction.modelVersion || env.ruleEngineVersion,
        classProbabilities: prediction.classProbabilities,
        domainBreakdown: analytics.domainBreakdown,
        reportDisclaimer: env.reportDisclaimer
      }
    },
    { upsert: true, new: true }
  );

  return report;
}

module.exports = { generateWeeklyReport, deriveStatus, buildWeeklyAnalytics, buildSummary };
