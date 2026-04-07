const express = require('express');

const healthRouter = require('./health');
const authRouter = require('./auth');
const consentRouter = require('./consent');
const childrenRouter = require('./children');
const activitiesRouter = require('./activities');
const logsRouter = require('./logs');
const dashboardRouter = require('./dashboard');
const reportsRouter = require('./reports');
const { requireAuth } = require('../middleware/auth');
const { requireConsent } = require('../middleware/requireConsent');

const router = express.Router();

router.use(healthRouter);

router.use('/auth', requireAuth, authRouter);
router.use('/consent', requireAuth, consentRouter);
router.use('/children', requireAuth, childrenRouter);
router.use('/activities', requireAuth, activitiesRouter);
router.use('/dashboard', requireAuth, dashboardRouter);
router.use('/logs', requireAuth, requireConsent, logsRouter);
router.use('/reports', requireAuth, requireConsent, reportsRouter);

module.exports = router;
