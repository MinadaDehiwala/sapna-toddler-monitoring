const express = require('express');
const createError = require('http-errors');
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
      consentVersion: env.consentVersion,
      acknowledgedScreeningOnly: req.user.parent.consentAcknowledgedScreeningOnly,
      acknowledgedDataUse: req.user.parent.consentAcknowledgedDataUse
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { acknowledgedScreeningOnly, acknowledgedDataUse } = req.body || {};
    if (acknowledgedScreeningOnly !== true || acknowledgedDataUse !== true) {
      throw createError(
        400,
        'Consent requires acknowledgedScreeningOnly=true and acknowledgedDataUse=true.'
      );
    }

    const acceptedAt = new Date();

    req.user.parent.hasAcceptedConsent = true;
    req.user.parent.consentAcceptedAt = acceptedAt;
    req.user.parent.consentAcknowledgedScreeningOnly = true;
    req.user.parent.consentAcknowledgedDataUse = true;
    await req.user.parent.save();

    await Consent.create({
      parentId: req.user.parent._id,
      version: env.consentVersion,
      acceptedAt,
      acknowledgedScreeningOnly: true,
      acknowledgedDataUse: true,
      userAgent: req.headers['user-agent'] || ''
    });

    res.status(201).json({
      hasAcceptedConsent: true,
      consentAcceptedAt: acceptedAt,
      consentVersion: env.consentVersion,
      acknowledgedScreeningOnly: true,
      acknowledgedDataUse: true
    });
  })
);

module.exports = router;
