const express = require('express');
const createError = require('http-errors');

const Parent = require('../models/Parent');
const Child = require('../models/Child');
const Consent = require('../models/Consent');
const Activity = require('../models/Activity');
const ActivityLog = require('../models/ActivityLog');
const WeeklyReport = require('../models/WeeklyReport');
const DeletedAccount = require('../models/DeletedAccount');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.get(
  '/export',
  asyncHandler(async (req, res) => {
    const parentId = req.user.parent._id;

    const [parent, consents, children, logs, reports] = await Promise.all([
      Parent.findById(parentId).lean(),
      Consent.find({ parentId }).sort({ acceptedAt: -1 }).lean(),
      Child.find({ parentId }).sort({ createdAt: -1 }).lean(),
      ActivityLog.find({ parentId }).sort({ completedAt: -1 }).lean(),
      WeeklyReport.find({ parentId }).sort({ weekStart: -1 }).lean()
    ]);

    const activityIds = [...new Set(logs.map((log) => String(log.activityId)).filter(Boolean))];
    const activities = activityIds.length
      ? await Activity.find({ _id: { $in: activityIds } }).lean()
      : [];

    res.json({
      exportedAt: new Date().toISOString(),
      parent,
      consentHistory: consents,
      children,
      activityLogs: logs,
      activities,
      weeklyReports: reports
    });
  })
);

router.delete(
  '/account',
  asyncHandler(async (req, res) => {
    const { confirmationText } = req.body || {};
    if (confirmationText !== 'DELETE MY DATA') {
      throw createError(400, 'Confirmation text mismatch. Enter exactly: DELETE MY DATA');
    }

    const parentId = req.user.parent._id;
    const firebaseUid = req.user.uid;
    const deletedAt = new Date();

    await DeletedAccount.findOneAndUpdate(
      { firebaseUid },
      { $set: { firebaseUid, deletedAt, reason: 'parent_requested' } },
      { upsert: true, new: true }
    );

    await Promise.all([
      Consent.deleteMany({ parentId }),
      WeeklyReport.deleteMany({ parentId }),
      ActivityLog.deleteMany({ parentId }),
      Child.deleteMany({ parentId }),
      Parent.deleteOne({ _id: parentId })
    ]);

    res.json({
      deleted: true,
      deletedAt: deletedAt.toISOString()
    });
  })
);

module.exports = router;
