const express = require('express');
const mongoose = require('mongoose');
const { isFirebaseConfigured } = require('../config/firebase');
const { getMlHealth } = require('../services/mlService');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.get(
  '/health',
  asyncHandler(async (req, res) => {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    const mlHealth = await getMlHealth();

    res.json({
      ok: true,
      service: 'toddler-monitoring-api',
      firebaseConfigured: isFirebaseConfigured(),
      mongoState: states[mongoose.connection.readyState] || 'unknown',
      ...mlHealth,
      timestamp: new Date().toISOString()
    });
  })
);

module.exports = router;
