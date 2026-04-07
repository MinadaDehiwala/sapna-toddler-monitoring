const { scoreFromSuccessLevel } = require('./milestoneRules');

const DOMAINS = ['cognitive', 'motor', 'language', 'social_emotional'];
const EXPECTATION_BASE = {
  cognitive: 0.52,
  motor: 0.55,
  language: 0.48,
  social_emotional: 0.5
};
const EXPECTATION_GROWTH = {
  cognitive: 0.2,
  motor: 0.18,
  language: 0.22,
  social_emotional: 0.18
};
const FEATURE_COLUMNS = [
  'age_in_months',
  'age_band_progress',
  'weekly_log_count',
  'active_days',
  'engagement_consistency',
  'total_duration_minutes',
  'avg_duration_minutes',
  'avg_parent_confidence',
  'needs_help_ratio',
  'partial_ratio',
  'completed_ratio',
  'mastered_ratio',
  'overall_completion_score',
  'cognitive_log_share',
  'motor_log_share',
  'language_log_share',
  'social_emotional_log_share',
  'cognitive_completion_score',
  'motor_completion_score',
  'language_completion_score',
  'social_emotional_completion_score',
  'cognitive_mastered_ratio',
  'motor_mastered_ratio',
  'language_mastered_ratio',
  'social_emotional_mastered_ratio',
  'cognitive_age_gap',
  'motor_age_gap',
  'language_age_gap',
  'social_emotional_age_gap',
  'overall_age_gap'
];

function clip(value, minValue, maxValue) {
  return Math.max(minValue, Math.min(maxValue, Number(value)));
}

function roundMetric(value) {
  return Number(Number(value || 0).toFixed(4));
}

function getAgeBandProgress(ageInMonths) {
  return clip((Number(ageInMonths) - 12) / 24, 0, 1);
}

function expectedCompletionScore(ageInMonths, domain) {
  const progress = getAgeBandProgress(ageInMonths);
  return clip(EXPECTATION_BASE[domain] + progress * EXPECTATION_GROWTH[domain], 0.35, 0.95);
}

function buildMlFeatureSet({ logs, ageInMonths }) {
  const features = Object.fromEntries(FEATURE_COLUMNS.map((feature) => [feature, 0]));
  features.age_in_months = Number(ageInMonths);
  features.age_band_progress = roundMetric(getAgeBandProgress(ageInMonths));

  if (!logs || logs.length === 0) {
    return features;
  }

  const totalLogs = logs.length;
  const totalDuration = logs.reduce((sum, log) => sum + Number(log.durationMinutes || 0), 0);
  const activeDays = new Set(
    logs
      .map((log) => new Date(log.completedAt))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map((date) => date.toISOString().slice(0, 10))
  ).size;
  const totalConfidence = logs.reduce((sum, log) => sum + Number(log.parentConfidence || 0), 0);

  const successCounts = {
    needs_help: 0,
    partial: 0,
    completed: 0,
    mastered: 0
  };
  const domainCounts = Object.fromEntries(DOMAINS.map((domain) => [domain, 0]));
  const domainScoreTotals = Object.fromEntries(DOMAINS.map((domain) => [domain, 0]));
  const domainMasteredCounts = Object.fromEntries(DOMAINS.map((domain) => [domain, 0]));

  logs.forEach((log) => {
    const successLevel = log.successLevel;
    const score = scoreFromSuccessLevel(successLevel);
    const domain = log.activityId?.domain || log.domain;

    if (successCounts[successLevel] !== undefined) {
      successCounts[successLevel] += 1;
    }

    if (domainCounts[domain] !== undefined) {
      domainCounts[domain] += 1;
      domainScoreTotals[domain] += score;
      if (successLevel === 'mastered') {
        domainMasteredCounts[domain] += 1;
      }
    }
  });

  features.weekly_log_count = totalLogs;
  features.active_days = activeDays;
  features.engagement_consistency = roundMetric(activeDays / 7);
  features.total_duration_minutes = roundMetric(totalDuration);
  features.avg_duration_minutes = roundMetric(totalDuration / totalLogs);
  features.avg_parent_confidence = roundMetric(totalConfidence / totalLogs);
  features.needs_help_ratio = roundMetric(successCounts.needs_help / totalLogs);
  features.partial_ratio = roundMetric(successCounts.partial / totalLogs);
  features.completed_ratio = roundMetric(successCounts.completed / totalLogs);
  features.mastered_ratio = roundMetric(successCounts.mastered / totalLogs);
  features.overall_completion_score = roundMetric(
    logs.reduce((sum, log) => sum + scoreFromSuccessLevel(log.successLevel), 0) / totalLogs
  );

  const expectedScores = [];
  const observedScores = [];

  DOMAINS.forEach((domain) => {
    const count = domainCounts[domain];
    const completionScore = count ? domainScoreTotals[domain] / count : 0;
    const masteredRatio = count ? domainMasteredCounts[domain] / count : 0;
    const expectedScore = expectedCompletionScore(ageInMonths, domain);
    const ageGap = completionScore - expectedScore;

    features[`${domain}_log_share`] = roundMetric(count / totalLogs);
    features[`${domain}_completion_score`] = roundMetric(completionScore);
    features[`${domain}_mastered_ratio`] = roundMetric(masteredRatio);
    features[`${domain}_age_gap`] = roundMetric(ageGap);

    observedScores.push(completionScore);
    expectedScores.push(expectedScore);
  });

  features.overall_age_gap = roundMetric(
    observedScores.reduce((sum, value) => sum + value, 0) / observedScores.length -
      expectedScores.reduce((sum, value) => sum + value, 0) / expectedScores.length
  );

  return features;
}

function deriveHeuristicRiskFactors(features, status = 'needs_monitoring') {
  if (status === 'on_track') {
    const positives = [];
    if (features.engagement_consistency >= 0.6) {
      positives.push('Guided activities were completed consistently across the week.');
    }
    if (features.overall_age_gap >= 0) {
      positives.push('Observed milestone completion met or exceeded the age-adjusted baseline.');
    }
    if (features.mastered_ratio >= 0.22) {
      positives.push('Several logged activities reached a mastered outcome.');
    }
    return positives.slice(0, 3);
  }

  const candidates = [
    {
      score: Math.max(0, -features.overall_age_gap),
      text: 'Milestone completion this week fell below the age-adjusted expectation.'
    },
    {
      score: Math.max(0, -features.language_age_gap),
      text: 'Language-focused activities appear below the expected range for this age.'
    },
    {
      score: Math.max(0, -features.motor_age_gap),
      text: 'Motor development activities appear below the expected range for this age.'
    },
    {
      score: Math.max(0, -features.cognitive_age_gap),
      text: 'Cognitive play outcomes appear below the expected range for this age.'
    },
    {
      score: Math.max(0, -features.social_emotional_age_gap),
      text: 'Social-emotional observations appear below the expected range for this age.'
    },
    {
      score: Math.max(0, (3 - features.weekly_log_count) / 3),
      text: 'Very few parent logs were recorded this week, which lowers confidence in the screening result.'
    },
    {
      score: Math.max(0, 0.45 - features.engagement_consistency),
      text: 'Guided activities were not spread consistently across the week.'
    },
    {
      score: Math.max(0, (2.75 - features.avg_parent_confidence) / 2.75),
      text: 'Parent confidence in the observed activity outcomes was low.'
    },
    {
      score: Math.max(0, features.needs_help_ratio - 0.25),
      text: 'A high share of activities required full support from the parent.'
    }
  ];

  return candidates
    .sort((left, right) => right.score - left.score)
    .filter((item) => item.score > 0)
    .slice(0, 3)
    .map((item) => item.text);
}

function buildFallbackProbabilities(status, overallScore, totalLogs) {
  if (totalLogs < 2) {
    return {
      on_track: 0.12,
      needs_monitoring: 0.68,
      at_risk: 0.2
    };
  }

  if (status === 'on_track') {
    const confidence = clip(0.58 + overallScore * 0.25, 0.65, 0.9);
    const remainder = 1 - confidence;
    return {
      on_track: roundMetric(confidence),
      needs_monitoring: roundMetric(remainder * 0.75),
      at_risk: roundMetric(remainder * 0.25)
    };
  }

  if (status === 'at_risk') {
    const confidence = clip(0.62 + (0.5 - overallScore) * 0.35, 0.65, 0.9);
    const remainder = 1 - confidence;
    return {
      on_track: roundMetric(remainder * 0.15),
      needs_monitoring: roundMetric(remainder * 0.55),
      at_risk: roundMetric(confidence)
    };
  }

  const confidence = clip(0.56 + Math.abs(overallScore - 0.58) * 0.2, 0.56, 0.78);
  const remainder = 1 - confidence;
  return {
    on_track: roundMetric(remainder * 0.42),
    needs_monitoring: roundMetric(confidence),
    at_risk: roundMetric(remainder * 0.58)
  };
}

module.exports = {
  DOMAINS,
  FEATURE_COLUMNS,
  buildMlFeatureSet,
  deriveHeuristicRiskFactors,
  buildFallbackProbabilities,
  expectedCompletionScore
};
