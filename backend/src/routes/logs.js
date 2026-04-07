const express = require('express');
const createError = require('http-errors');
const Activity = require('../models/Activity');
const ActivityLog = require('../models/ActivityLog');
const { asyncHandler } = require('../utils/asyncHandler');
const { getChildForParent } = require('../utils/ownership');

const router = express.Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      childId,
      activityId,
      completedAt = new Date().toISOString(),
      durationMinutes,
      successLevel,
      parentConfidence,
      notes = ''
    } = req.body;

    if (!childId || !activityId || !durationMinutes || !successLevel || !parentConfidence) {
      throw createError(
        400,
        'childId, activityId, durationMinutes, successLevel, and parentConfidence are required.'
      );
    }

    await getChildForParent(childId, req.user.parent._id);

    const activity = await Activity.findOne({ _id: activityId, isActive: true });
    if (!activity) {
      throw createError(404, 'Activity not found.');
    }

    const parsedCompletedAt = new Date(completedAt);
    if (Number.isNaN(parsedCompletedAt.getTime())) {
      throw createError(400, 'Invalid completedAt value.');
    }

    const log = await ActivityLog.create({
      parentId: req.user.parent._id,
      childId,
      activityId,
      completedAt: parsedCompletedAt,
      durationMinutes: Number(durationMinutes),
      successLevel,
      parentConfidence: Number(parentConfidence),
      notes: String(notes).trim()
    });

    const populated = await ActivityLog.findById(log._id)
      .populate('activityId')
      .populate('childId', 'nickname dateOfBirth');

    res.status(201).json({ log: populated });
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { childId, from, to, limit = 100 } = req.query;
    const filter = { parentId: req.user.parent._id };

    if (childId) {
      await getChildForParent(childId, req.user.parent._id);
      filter.childId = childId;
    }

    if (from || to) {
      filter.completedAt = {};
      if (from) filter.completedAt.$gte = new Date(from);
      if (to) filter.completedAt.$lte = new Date(to);
    }

    const logs = await ActivityLog.find(filter)
      .sort({ completedAt: -1 })
      .limit(Number(limit))
      .populate('activityId')
      .populate('childId', 'nickname dateOfBirth');

    res.json({ logs });
  })
);

module.exports = router;
