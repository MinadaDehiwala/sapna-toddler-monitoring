const express = require('express');
const mongoose = require('mongoose');
const { isFirebaseConfigured } = require('../config/firebase');

const router = express.Router();

router.get('/health', (req, res) => {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  res.json({
    ok: true,
    service: 'toddler-monitoring-api',
    firebaseConfigured: isFirebaseConfigured(),
    mongoState: states[mongoose.connection.readyState] || 'unknown',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
