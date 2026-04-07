const express = require('express');
const createError = require('http-errors');
const Child = require('../models/Child');
const { asyncHandler } = require('../utils/asyncHandler');
const { calculateAgeInMonths, getAgeWarning } = require('../utils/age');

const router = express.Router();

function formatChild(childDoc) {
  const ageInMonths = calculateAgeInMonths(childDoc.dateOfBirth);
  return {
    ...childDoc.toObject(),
    ageInMonths,
    ageWarning: getAgeWarning(ageInMonths)
  };
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { nickname, dateOfBirth, sex = '' } = req.body;

    if (!nickname || !dateOfBirth) {
      throw createError(400, 'nickname and dateOfBirth are required.');
    }

    const parsedDob = new Date(dateOfBirth);
    if (Number.isNaN(parsedDob.getTime())) {
      throw createError(400, 'Invalid dateOfBirth value.');
    }

    const child = await Child.create({
      parentId: req.user.parent._id,
      nickname: String(nickname).trim(),
      dateOfBirth: parsedDob,
      sex: String(sex)
    });

    res.status(201).json({ child: formatChild(child) });
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const children = await Child.find({ parentId: req.user.parent._id }).sort({ createdAt: -1 });
    res.json({ children: children.map(formatChild) });
  })
);

router.patch(
  '/:childId',
  asyncHandler(async (req, res) => {
    const child = await Child.findOne({ _id: req.params.childId, parentId: req.user.parent._id });

    if (!child) {
      throw createError(404, 'Child not found for this parent.');
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

module.exports = router;
