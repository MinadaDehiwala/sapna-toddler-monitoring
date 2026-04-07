const express = require('express');
const Activity = require('../models/Activity');
const { asyncHandler } = require('../utils/asyncHandler');
const { getChildForParent } = require('../utils/ownership');
const { calculateAgeInMonths } = require('../utils/age');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = { isActive: true };

    if (req.query.domain) {
      filter.domain = req.query.domain;
    }

    if (req.query.childId) {
      const child = await getChildForParent(req.query.childId, req.user.parent._id);
      const ageInMonths = calculateAgeInMonths(child.dateOfBirth);

      filter.ageBandMinMonths = { $lte: ageInMonths };
      filter.ageBandMaxMonths = { $gte: ageInMonths };
    }

    const activities = await Activity.find(filter).sort({ ageBandMinMonths: 1, title: 1 });

    res.json({ activities });
  })
);

module.exports = router;
