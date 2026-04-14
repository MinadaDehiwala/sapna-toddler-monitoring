const { addDays, startOfWeek, subWeeks } = require('date-fns');
const { connectMongo } = require('../config/mongo');
const { initializeFirebase } = require('../config/firebase');
const Parent = require('../models/Parent');
const Child = require('../models/Child');
const Consent = require('../models/Consent');
const Activity = require('../models/Activity');
const ActivityLog = require('../models/ActivityLog');
const WeeklyReport = require('../models/WeeklyReport');
const { env } = require('../config/env');
const { ACTIVITY_SEED } = require('./seedActivities');
const { generateWeeklyReport } = require('../services/reportService');

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1) return process.argv[index + 1] || fallback;
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function monthsAgo(months, referenceDate = new Date()) {
  const date = new Date(referenceDate);
  date.setMonth(date.getMonth() - months);
  date.setDate(15);
  date.setHours(12, 0, 0, 0);
  return date;
}

function parseReferenceDate(value) {
  if (!value) return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid --reference-date value. Use YYYY-MM-DD.');
  }
  return parsed;
}

function pickActivity(activitiesByDomain, domain, ageInMonths) {
  const candidates = activitiesByDomain[domain] || [];
  return (
    candidates.find(
      (activity) =>
        activity.ageBandMinMonths <= ageInMonths && activity.ageBandMaxMonths >= ageInMonths
    ) ||
    candidates.find((activity) => activity.ageBandMaxMonths >= ageInMonths) ||
    candidates[0]
  );
}

function buildOutcome(profile, weekIndex, logIndex, domain) {
  if (profile === 'on_track') {
    return {
      successLevel: ['completed', 'mastered', 'completed', 'partial'][(weekIndex + logIndex) % 4],
      parentConfidence: [4, 5, 5, 4][(weekIndex + logIndex) % 4],
      note: `Engaged well with ${domain.replace('_', ' ')} play and needed minimal prompting.`
    };
  }

  if (profile === 'mixed') {
    return {
      successLevel: ['partial', 'completed', 'needs_help', 'partial'][(weekIndex + logIndex) % 4],
      parentConfidence: [3, 4, 2, 3][(weekIndex + logIndex) % 4],
      note: `Showed mixed ${domain.replace('_', ' ')} responses; parent repeated prompts and shortened the activity.`
    };
  }

  return {
    successLevel: ['needs_help', 'partial', 'needs_help', 'completed'][(weekIndex + logIndex) % 4],
    parentConfidence: [2, 3, 2, 3][(weekIndex + logIndex) % 4],
    note: `Needed steady parent support during ${domain.replace('_', ' ')} activity; track again next week.`
  };
}

async function upsertActivities() {
  for (const activity of ACTIVITY_SEED) {
    await Activity.findOneAndUpdate(
      { code: activity.code },
      { $set: activity },
      { upsert: true, new: true }
    );
  }

  const activities = await Activity.find({ isActive: true }).sort({ ageBandMinMonths: 1, code: 1 });
  return activities.reduce((grouped, activity) => {
    grouped[activity.domain] = grouped[activity.domain] || [];
    grouped[activity.domain].push(activity);
    return grouped;
  }, {});
}

async function resetParentData(parentId) {
  await Promise.all([
    Consent.deleteMany({ parentId }),
    WeeklyReport.deleteMany({ parentId }),
    ActivityLog.deleteMany({ parentId }),
    Child.deleteMany({ parentId })
  ]);
}

async function createDemoChild({ parentId, childConfig, activitiesByDomain, referenceWeek, referenceDate }) {
  const child = await Child.create({
    parentId,
    nickname: childConfig.nickname,
    dateOfBirth: monthsAgo(childConfig.ageInMonths, referenceDate),
    sex: childConfig.sex
  });

  const domains = ['cognitive', 'motor', 'language', 'social_emotional'];
  for (let weekIndex = 7; weekIndex >= 0; weekIndex -= 1) {
    const weekStart = subWeeks(referenceWeek, weekIndex);
    const logsThisWeek = childConfig.logsPerWeek[7 - weekIndex];

    for (let logIndex = 0; logIndex < logsThisWeek; logIndex += 1) {
      const domain = domains[(logIndex + weekIndex + childConfig.domainOffset) % domains.length];
      const activity = pickActivity(activitiesByDomain, domain, childConfig.ageInMonths);
      const outcome = buildOutcome(childConfig.profile, weekIndex, logIndex, domain);

      await ActivityLog.create({
        parentId,
        childId: child._id,
        activityId: activity._id,
        completedAt: addDays(weekStart, (logIndex * 2) % 7),
        durationMinutes: 8 + ((logIndex + weekIndex + childConfig.durationOffset) % 13),
        successLevel: outcome.successLevel,
        parentConfidence: outcome.parentConfidence,
        notes: outcome.note
      });
    }

    await generateWeeklyReport({
      parentId,
      childId: child._id,
      referenceDate: addDays(weekStart, 3)
    });
  }

  return child;
}

async function seedDemoForEmail({ email = 'test1@gmail.com', shouldReset = false, referenceDate = new Date() } = {}) {
  const normalizedEmail = String(email || '').toLowerCase().trim();
  if (!normalizedEmail) {
    throw new Error('Usage: npm run seed:demo -- --email test1@gmail.com --reset');
  }
  if (!shouldReset) {
    throw new Error('Demo seeding requires --reset so duplicate data is not created.');
  }

  const parent = await Parent.findOne({ email: normalizedEmail });
  if (!parent) {
    throw new Error(`${normalizedEmail} was not found. Log in with that account once, then run this again.`);
  }

  await resetParentData(parent._id);
  const activitiesByDomain = await upsertActivities();
  const referenceWeek = startOfWeek(referenceDate, { weekStartsOn: 1 });

  parent.role = parent.role === 'admin' ? 'admin' : 'parent';
  parent.displayName = parent.displayName || 'Demo Parent';
  parent.hasAcceptedConsent = true;
  parent.consentAcceptedAt = new Date(referenceDate);
  parent.consentAcknowledgedScreeningOnly = true;
  parent.consentAcknowledgedDataUse = true;
  await parent.save();

  await Consent.create({
    parentId: parent._id,
    version: env.consentVersion,
    acknowledgedScreeningOnly: true,
    acknowledgedDataUse: true,
    acceptedAt: new Date(referenceDate)
  });

  const childConfigs = [
    {
      nickname: 'Ari',
      ageInMonths: 24,
      sex: 'other',
      profile: 'on_track',
      logsPerWeek: [6, 7, 8, 7, 9, 8, 9, 8],
      domainOffset: 0,
      durationOffset: 1
    },
    {
      nickname: 'Nila',
      ageInMonths: 31,
      sex: 'female',
      profile: 'mixed',
      logsPerWeek: [4, 5, 5, 4, 6, 5, 6, 5],
      domainOffset: 1,
      durationOffset: 3
    },
    {
      nickname: 'Kavi',
      ageInMonths: 18,
      sex: 'male',
      profile: 'support',
      logsPerWeek: [3, 4, 3, 4, 5, 4, 5, 4],
      domainOffset: 2,
      durationOffset: 5
    }
  ];

  for (const childConfig of childConfigs) {
    await createDemoChild({
      parentId: parent._id,
      childConfig,
      activitiesByDomain,
      referenceWeek,
      referenceDate
    });
  }

  const [children, logs, reports, consents] = await Promise.all([
    Child.countDocuments({ parentId: parent._id }),
    ActivityLog.countDocuments({ parentId: parent._id }),
    WeeklyReport.countDocuments({ parentId: parent._id }),
    Consent.countDocuments({ parentId: parent._id })
  ]);

  return {
    email: normalizedEmail,
    parentId: parent._id.toString(),
    counts: { children, logs, reports, consents }
  };
}

async function seedDemoCli() {
  initializeFirebase();
  await connectMongo();

  const result = await seedDemoForEmail({
    email: getArg('email', 'test1@gmail.com'),
    shouldReset: hasFlag('reset'),
    referenceDate: parseReferenceDate(getArg('reference-date', ''))
  });

  console.log(
    `Demo seed completed for ${result.email}: ${result.counts.children} children, ${result.counts.logs} logs, ${result.counts.reports} weekly reports.`
  );
  process.exit(0);
}

if (require.main === module) {
  seedDemoCli().catch((error) => {
    console.error('Failed to seed demo data', error.message || error);
    process.exit(1);
  });
}

module.exports = {
  seedDemoForEmail,
  resetParentData,
  upsertActivities,
  buildOutcome,
  monthsAgo
};
