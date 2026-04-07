const express = require('express');
const createError = require('http-errors');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    if (!req.user?.parent) {
      throw createError(401, 'Unauthorized.');
    }

    res.json({
      parent: req.user.parent,
      tokenInfo: {
        uid: req.user.uid,
        email: req.user.email
      }
    });
  })
);

router.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const { displayName = '' } = req.body;

    req.user.parent.displayName = String(displayName).trim();
    await req.user.parent.save();

    res.json({ parent: req.user.parent });
  })
);

module.exports = router;
