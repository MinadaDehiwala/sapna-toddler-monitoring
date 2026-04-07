const express = require('express');
const { env } = require('../config/env');
const Consent = require('../models/Consent');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.get(
  '/status',
  asyncHandler(async (req, res) => {
    res.json({
      hasAcceptedConsent: req.user.parent.hasAcceptedConsent,
      consentAcceptedAt: req.user.parent.consentAcceptedAt,
      consentVersion: env.consentVersion
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const acceptedAt = new Date();

    req.user.parent.hasAcceptedConsent = true;
    req.user.parent.consentAcceptedAt = acceptedAt;
    await req.user.parent.save();

    await Consent.create({
      parentId: req.user.parent._id,
      version: env.consentVersion,
      acceptedAt,
      userAgent: req.headers['user-agent'] || ''
    });

    res.status(201).json({
      hasAcceptedConsent: true,
      consentAcceptedAt: acceptedAt,
      consentVersion: env.consentVersion
    });
  })
);

module.exports = router;
