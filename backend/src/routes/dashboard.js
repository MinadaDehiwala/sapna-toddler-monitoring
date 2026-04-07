const express = require('express');
const { subDays } = require('date-fns');
const ActivityLog = require('../models/ActivityLog');
const WeeklyReport = require('../models/WeeklyReport');
const { asyncHandler } = require('../utils/asyncHandler');
const { getChildForParent } = require('../utils/ownership');
const { calculateAgeInMonths, getAgeWarning } = require('../utils/age');

const router = express.Router();

router.get(
  '/:childId',
  asyncHandler(async (req, res) => {
    const child = await getChildForParent(req.params.childId, req.user.parent._id);
    const ageInMonths = calculateAgeInMonths(child.dateOfBirth);

    const since = subDays(new Date(), 30);
    const recentLogs = await ActivityLog.find({
      parentId: req.user.parent._id,
      childId: child._id,
      completedAt: { $gte: since }
    }).populate('activityId');

    const totalDurationMinutes = recentLogs.reduce((sum, log) => sum + (log.durationMinutes || 0), 0);

    const domainTotals = {
      cognitive: 0,
      motor: 0,
      language: 0,
      social_emotional: 0
    };

    const successCounts = {
      needs_help: 0,
      partial: 0,
      completed: 0,
      mastered: 0
    };

    recentLogs.forEach((log) => {
      const domain = log.activityId?.domain;
      if (domain && domainTotals[domain] !== undefined) {
        domainTotals[domain] += 1;
      }
      if (successCounts[log.successLevel] !== undefined) {
        successCounts[log.successLevel] += 1;
      }
    });

    const latestReport = await WeeklyReport.findOne({
      parentId: req.user.parent._id,
      childId: child._id
    }).sort({ weekStart: -1 });

    res.json({
      child: {
        ...child.toObject(),
        ageInMonths,
        ageWarning: getAgeWarning(ageInMonths)
      },
      stats: {
        logsLast30Days: recentLogs.length,
        totalDurationMinutes,
        domainTotals,
        successCounts
      },
      latestReport,
      medicalDisclaimer:
        'This dashboard supports developmental screening and monitoring only. It is not a medical diagnosis.'
    });
  })
);

module.exports = router;
