const express = require('express');
const createError = require('http-errors');
const { subDays } = require('date-fns');
const Parent = require('../models/Parent');
const Child = require('../models/Child');
const Consent = require('../models/Consent');
const ActivityLog = require('../models/ActivityLog');
const WeeklyReport = require('../models/WeeklyReport');
const { asyncHandler } = require('../utils/asyncHandler');
const { calculateAgeInMonths, getAgeWarning } = require('../utils/age');
const { getMlHealth } = require('../services/mlService');

const router = express.Router();

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatChild(childDoc) {
  const plain = childDoc.toObject ? childDoc.toObject() : childDoc;
  const ageInMonths = calculateAgeInMonths(plain.dateOfBirth);
  return {
    ...plain,
    ageInMonths,
    ageWarning: getAgeWarning(ageInMonths)
  };
}

async function getParentCounts(parentIds) {
  const ids = parentIds.map((id) => id.toString());
  const [children, logs, reports] = await Promise.all([
    Child.aggregate([{ $match: { parentId: { $in: parentIds } } }, { $group: { _id: '$parentId', count: { $sum: 1 } } }]),
    ActivityLog.aggregate([{ $match: { parentId: { $in: parentIds } } }, { $group: { _id: '$parentId', count: { $sum: 1 } } }]),
    WeeklyReport.aggregate([{ $match: { parentId: { $in: parentIds } } }, { $group: { _id: '$parentId', count: { $sum: 1 } } }])
  ]);

  const counts = Object.fromEntries(ids.map((id) => [id, { children: 0, logs: 0, reports: 0 }]));
  children.forEach((item) => {
    counts[item._id.toString()].children = item.count;
  });
  logs.forEach((item) => {
    counts[item._id.toString()].logs = item.count;
  });
  reports.forEach((item) => {
    counts[item._id.toString()].reports = item.count;
  });
  return counts;
}

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const since = subDays(new Date(), 7);
    const [parents, children, logs, reports, consents, recentLogs, recentReports, mlHealth] =
      await Promise.all([
        Parent.countDocuments(),
        Child.countDocuments(),
        ActivityLog.countDocuments(),
        WeeklyReport.countDocuments(),
        Consent.countDocuments(),
        ActivityLog.countDocuments({ createdAt: { $gte: since } }),
        WeeklyReport.countDocuments({ createdAt: { $gte: since } }),
        getMlHealth()
      ]);

    res.json({
      summary: {
        parents,
        children,
        logs,
        reports,
        consents,
        recentLogs,
        recentReports,
        mlHealth
      }
    });
  })
);

router.get(
  '/parents',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
    const page = Math.max(Number(req.query.page || 1), 1);
    const query = String(req.query.query || '').trim();
    const filter = query
      ? {
          $or: [
            { email: new RegExp(escapeRegex(query), 'i') },
            { displayName: new RegExp(escapeRegex(query), 'i') }
          ]
        }
      : {};

    const [total, parents] = await Promise.all([
      Parent.countDocuments(filter),
      Parent.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
    ]);
    const counts = await getParentCounts(parents.map((parent) => parent._id));

    res.json({
      parents: parents.map((parent) => ({
        ...parent.toObject(),
        counts: counts[parent._id.toString()] || { children: 0, logs: 0, reports: 0 }
      })),
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  })
);

router.get(
  '/parents/:parentId',
  asyncHandler(async (req, res) => {
    const parent = await Parent.findById(req.params.parentId).lean();
    if (!parent) {
      throw createError(404, 'Parent not found.');
    }

    const [children, logs, reports, consentHistory] = await Promise.all([
      Child.find({ parentId: parent._id }).sort({ createdAt: -1 }),
      ActivityLog.find({ parentId: parent._id })
        .sort({ completedAt: -1 })
        .limit(100)
        .populate('activityId')
        .populate('childId', 'nickname dateOfBirth'),
      WeeklyReport.find({ parentId: parent._id }).sort({ weekStart: -1 }).limit(50),
      Consent.find({ parentId: parent._id }).sort({ acceptedAt: -1 }).limit(20)
    ]);

    res.json({
      parent,
      children: children.map(formatChild),
      logs,
      reports,
      consentHistory
    });
  })
);

router.patch(
  '/parents/:parentId',
  asyncHandler(async (req, res) => {
    const parent = await Parent.findById(req.params.parentId);
    if (!parent) {
      throw createError(404, 'Parent not found.');
    }

    if (typeof req.body.displayName !== 'undefined') {
      parent.displayName = String(req.body.displayName).trim();
    }

    if (typeof req.body.role !== 'undefined') {
      const nextRole = String(req.body.role);
      if (!['parent', 'admin'].includes(nextRole)) {
        throw createError(400, 'role must be parent or admin.');
      }
      if (
        parent._id.equals(req.user.parent._id) &&
        parent.role === 'admin' &&
        nextRole === 'parent' &&
        (await Parent.countDocuments({ role: 'admin' })) <= 1
      ) {
        throw createError(400, 'Cannot demote the only admin account.');
      }
      parent.role = nextRole;
    }

    await parent.save();
    res.json({ parent });
  })
);

router.patch(
  '/children/:childId',
  asyncHandler(async (req, res) => {
    const child = await Child.findById(req.params.childId);
    if (!child) {
      throw createError(404, 'Child not found.');
    }

    if (typeof req.body.nickname !== 'undefined') {
      child.nickname = String(req.body.nickname).trim();
    }
    if (typeof req.body.dateOfBirth !== 'undefined') {
      const parsedDob = new Date(req.body.dateOfBirth);
      if (Number.isNaN(parsedDob.getTime())) {
        throw createError(400, 'Invalid dateOfBirth value.');
      }
      child.dateOfBirth = parsedDob;
    }
    if (typeof req.body.sex !== 'undefined') {
      child.sex = String(req.body.sex);
    }

    await child.save();
    res.json({ child: formatChild(child) });
  })
);

router.delete(
  '/children/:childId',
  asyncHandler(async (req, res) => {
    if (req.body?.confirmationText !== 'DELETE CHILD DATA') {
      throw createError(400, 'Confirmation text mismatch. Enter exactly: DELETE CHILD DATA');
    }

    const child = await Child.findById(req.params.childId);
    if (!child) {
      throw createError(404, 'Child not found.');
    }

    const [reports, logs] = await Promise.all([
      WeeklyReport.deleteMany({ childId: child._id }),
      ActivityLog.deleteMany({ childId: child._id })
    ]);
    await Child.deleteOne({ _id: child._id });

    res.json({
      deleted: true,
      deletedAt: new Date().toISOString(),
      deletedCounts: {
        children: 1,
        logs: logs.deletedCount,
        reports: reports.deletedCount
      }
    });
  })
);

router.delete(
  '/logs/:logId',
  asyncHandler(async (req, res) => {
    if (req.body?.confirmationText !== 'DELETE LOG') {
      throw createError(400, 'Confirmation text mismatch. Enter exactly: DELETE LOG');
    }

    const result = await ActivityLog.deleteOne({ _id: req.params.logId });
    if (!result.deletedCount) {
      throw createError(404, 'Log not found.');
    }

    res.json({ deleted: true, deletedAt: new Date().toISOString() });
  })
);

router.delete(
  '/reports/:reportId',
  asyncHandler(async (req, res) => {
    if (req.body?.confirmationText !== 'DELETE REPORT') {
      throw createError(400, 'Confirmation text mismatch. Enter exactly: DELETE REPORT');
    }

    const result = await WeeklyReport.deleteOne({ _id: req.params.reportId });
    if (!result.deletedCount) {
      throw createError(404, 'Report not found.');
    }

    res.json({ deleted: true, deletedAt: new Date().toISOString() });
  })
);

router.delete(
  '/parents/:parentId/data',
  asyncHandler(async (req, res) => {
    if (req.body?.confirmationText !== 'DELETE USER DATA') {
      throw createError(400, 'Confirmation text mismatch. Enter exactly: DELETE USER DATA');
    }

    const parent = await Parent.findById(req.params.parentId);
    if (!parent) {
      throw createError(404, 'Parent not found.');
    }

    const [consents, reports, logs, children] = await Promise.all([
      Consent.deleteMany({ parentId: parent._id }),
      WeeklyReport.deleteMany({ parentId: parent._id }),
      ActivityLog.deleteMany({ parentId: parent._id }),
      Child.deleteMany({ parentId: parent._id })
    ]);

    parent.hasAcceptedConsent = false;
    parent.consentAcceptedAt = null;
    parent.consentAcknowledgedScreeningOnly = false;
    parent.consentAcknowledgedDataUse = false;
    await parent.save();

    res.json({
      deleted: true,
      deletedAt: new Date().toISOString(),
      deletedCounts: {
        consents: consents.deletedCount,
        reports: reports.deletedCount,
        logs: logs.deletedCount,
        children: children.deletedCount
      }
    });
  })
);

module.exports = router;
