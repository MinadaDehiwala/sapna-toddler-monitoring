import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createRequire } from 'module';
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID = 'test-project-id';

const tokenToPayload = {
  'token-main': { uid: 'uid-main', email: 'main@example.com', name: 'Main Parent' },
  'token-alt': { uid: 'uid-alt', email: 'alt@example.com', name: 'Alt Parent' }
};

vi.mock('firebase-admin', () => {
  const apps = [];
  return {
    apps,
    initializeApp: vi.fn((config) => {
      apps.push(config || {});
      return config;
    }),
    credential: {
      cert: vi.fn((payload) => payload)
    },
    auth: vi.fn(() => ({
      verifyIdToken: vi.fn(async (token) => {
        const decoded = tokenToPayload[token];
        if (!decoded) {
          const err = new Error('Invalid token');
          err.status = 401;
          throw err;
        }
        return decoded;
      })
    }))
  };
});

const require = createRequire(import.meta.url);
const { env } = require('../src/config/env.js');
const firebaseConfigModule = await import('../src/config/firebase.js');
const appModule = await import('../src/app.js');

const { initializeFirebase } = firebaseConfigModule;
const { app } = appModule;

if (!mongoose.models.Activity) {
  await import('../src/models/Activity.js');
}
if (!mongoose.models.Parent) {
  await import('../src/models/Parent.js');
}
if (!mongoose.models.Child) {
  await import('../src/models/Child.js');
}
if (!mongoose.models.Consent) {
  await import('../src/models/Consent.js');
}
if (!mongoose.models.ActivityLog) {
  await import('../src/models/ActivityLog.js');
}
if (!mongoose.models.WeeklyReport) {
  await import('../src/models/WeeklyReport.js');
}
if (!mongoose.models.DeletedAccount) {
  await import('../src/models/DeletedAccount.js');
}

const Activity = mongoose.model('Activity');
const Parent = mongoose.model('Parent');
const Child = mongoose.model('Child');
const Consent = mongoose.model('Consent');
const ActivityLog = mongoose.model('ActivityLog');
const WeeklyReport = mongoose.model('WeeklyReport');
const DeletedAccount = mongoose.model('DeletedAccount');

let mongoServer;

function authRequest(token = 'token-main') {
  const payload = tokenToPayload[token];
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return {
    get: (path) => request(app).get(path).set('x-test-user', encodedPayload),
    post: (path) => request(app).post(path).set('x-test-user', encodedPayload),
    patch: (path) => request(app).patch(path).set('x-test-user', encodedPayload),
    del: (path) => request(app).delete(path).set('x-test-user', encodedPayload)
  };
}

describe('API compliance and privacy flows', () => {
  beforeAll(async () => {
    initializeFirebase();
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri(), {
      serverSelectionTimeoutMS: 5000
    });
  });

  beforeEach(async () => {
    env.mlServiceEnabled = false;
    env.mlServiceUrl = 'http://127.0.0.1:8010';
    env.mlServiceTimeoutMs = 1000;
    env.mlHealthTimeoutMs = 600;
    env.mlConfidenceThreshold = 0.55;
    vi.unstubAllGlobals();

    await Promise.all([
      Parent.deleteMany({}),
      Child.deleteMany({}),
      Consent.deleteMany({}),
      ActivityLog.deleteMany({}),
      WeeklyReport.deleteMany({}),
      Activity.deleteMany({}),
      DeletedAccount.deleteMany({})
    ]);
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('keeps health and auth endpoints functional', async () => {
    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body.ok).toBe(true);
    expect(health.body.mlServiceReachable).toBe(false);

    const me = await authRequest().get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.parent.email).toBe('main@example.com');
  });

  it('rejects consent capture when required acknowledgments are missing', async () => {
    const response = await authRequest().post('/api/consent').send({});
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('acknowledgedScreeningOnly=true');
  });

  it('blocks logs and reports until consent is accepted, then allows full flow', async () => {
    const activity = await Activity.create({
      code: 'TST_ACTIVITY',
      title: 'Test activity',
      description: 'Test activity for log route',
      domain: 'cognitive',
      ageBandMinMonths: 12,
      ageBandMaxMonths: 36,
      estimatedMinutes: 10,
      instructions: ['Do a thing']
    });

    const childRes = await authRequest().post('/api/children').send({
      nickname: 'Kid',
      dateOfBirth: '2024-01-01',
      sex: 'other'
    });
    expect(childRes.status).toBe(201);
    const childId = childRes.body.child._id;

    const blockedLog = await authRequest().post('/api/logs').send({
      childId,
      activityId: String(activity._id),
      durationMinutes: 12,
      successLevel: 'completed',
      parentConfidence: 4
    });
    expect(blockedLog.status).toBe(403);

    const blockedReport = await authRequest().post('/api/reports/generate-weekly').send({ childId });
    expect(blockedReport.status).toBe(403);

    const consentRes = await authRequest().post('/api/consent').send({
      acknowledgedScreeningOnly: true,
      acknowledgedDataUse: true
    });
    expect(consentRes.status).toBe(201);
    expect(consentRes.body.acknowledgedDataUse).toBe(true);

    const allowedLog = await authRequest().post('/api/logs').send({
      childId,
      activityId: String(activity._id),
      durationMinutes: 12,
      successLevel: 'completed',
      parentConfidence: 4
    });
    expect(allowedLog.status).toBe(201);

    const reportRes = await authRequest().post('/api/reports/generate-weekly').send({ childId });
    expect(reportRes.status).toBe(201);
    expect(reportRes.body.report.reportDisclaimer).toBeTruthy();
  });

  it('returns a complete export package and supports hard account deletion', async () => {
    const activity = await Activity.create({
      code: 'TST_ACTIVITY_EXPORT',
      title: 'Export activity',
      description: 'Export route fixture',
      domain: 'motor',
      ageBandMinMonths: 12,
      ageBandMaxMonths: 36,
      estimatedMinutes: 15,
      instructions: ['Test']
    });

    await authRequest().post('/api/consent').send({
      acknowledgedScreeningOnly: true,
      acknowledgedDataUse: true
    });
    const childRes = await authRequest().post('/api/children').send({
      nickname: 'ExportKid',
      dateOfBirth: '2024-01-01'
    });
    const childId = childRes.body.child._id;

    await authRequest().post('/api/logs').send({
      childId,
      activityId: String(activity._id),
      durationMinutes: 10,
      successLevel: 'mastered',
      parentConfidence: 5
    });
    await authRequest().post('/api/reports/generate-weekly').send({ childId });

    const exportRes = await authRequest().get('/api/privacy/export');
    expect(exportRes.status).toBe(200);
    expect(exportRes.body.parent.email).toBe('main@example.com');
    expect(exportRes.body.consentHistory.length).toBeGreaterThan(0);
    expect(exportRes.body.children.length).toBeGreaterThan(0);
    expect(exportRes.body.activityLogs.length).toBeGreaterThan(0);
    expect(exportRes.body.activities.length).toBeGreaterThan(0);
    expect(exportRes.body.weeklyReports.length).toBeGreaterThan(0);

    const badDelete = await authRequest().del('/api/privacy/account').send({
      confirmationText: 'DELETE'
    });
    expect(badDelete.status).toBe(400);

    const deleteRes = await authRequest().del('/api/privacy/account').send({
      confirmationText: 'DELETE MY DATA'
    });
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.deleted).toBe(true);

    expect(await Parent.countDocuments()).toBe(0);
    expect(await Child.countDocuments()).toBe(0);
    expect(await Consent.countDocuments()).toBe(0);
    expect(await ActivityLog.countDocuments()).toBe(0);
    expect(await WeeklyReport.countDocuments()).toBe(0);
    expect(await DeletedAccount.countDocuments({ firebaseUid: 'uid-main' })).toBe(1);

    const blocked = await authRequest().get('/api/auth/me');
    expect(blocked.status).toBe(403);
  });

  it('uses the ML sidecar when prediction confidence is high', async () => {
    env.mlServiceEnabled = true;
    const fetchMock = vi.fn(async (url) => {
      if (String(url).endsWith('/predict')) {
        return {
          ok: true,
          json: async () => ({
            status: 'at_risk',
            confidence: 0.87,
            classProbabilities: {
              on_track: 0.05,
              needs_monitoring: 0.08,
              at_risk: 0.87
            },
            topRiskFactors: ['Language-focused activities appear below the expected range for this age.'],
            modelName: 'hybrid_rf',
            modelVersion: 'sapna-ml-test'
          })
        };
      }

      if (String(url).endsWith('/health')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            modelVersion: 'sapna-ml-test'
          })
        };
      }

      throw new Error(`Unexpected ML fetch: ${url}`);
    });
    globalThis.fetch = fetchMock;

    const activity = await Activity.create({
      code: 'TST_ACTIVITY_ML',
      title: 'ML activity',
      description: 'ML route fixture',
      domain: 'language',
      ageBandMinMonths: 12,
      ageBandMaxMonths: 36,
      estimatedMinutes: 12,
      instructions: ['Test']
    });

    await authRequest().post('/api/consent').send({
      acknowledgedScreeningOnly: true,
      acknowledgedDataUse: true
    });
    const childRes = await authRequest().post('/api/children').send({
      nickname: 'MLKid',
      dateOfBirth: '2024-01-01'
    });
    const childId = childRes.body.child._id;

    await authRequest().post('/api/logs').send({
      childId,
      activityId: String(activity._id),
      durationMinutes: 9,
      successLevel: 'needs_help',
      parentConfidence: 2
    });

    const reportRes = await authRequest().post('/api/reports/generate-weekly').send({ childId });
    expect(reportRes.status).toBe(201);
    expect(fetchMock).toHaveBeenCalled();
    expect(reportRes.body.report.predictionSource).toBe('ml');
    expect(reportRes.body.report.modelVersion).toBe('sapna-ml-test');
    expect(reportRes.body.report.topRiskFactors.length).toBeGreaterThan(0);

    const healthRes = await request(app).get('/api/health');
    expect(healthRes.status).toBe(200);
    expect(healthRes.body.mlServiceReachable).toBe(true);
    expect(healthRes.body.mlModelVersion).toBe('sapna-ml-test');
  });

  it('falls back to rules when ML confidence is too low', async () => {
    env.mlServiceEnabled = true;
    const fetchMock = vi.fn(async (url) => {
      if (String(url).endsWith('/predict')) {
        return {
          ok: true,
          json: async () => ({
            status: 'at_risk',
            confidence: 0.32,
            classProbabilities: {
              on_track: 0.08,
              needs_monitoring: 0.6,
              at_risk: 0.32
            },
            topRiskFactors: ['ML sidecar suggested low-confidence risk.'],
            modelName: 'hybrid_rf',
            modelVersion: 'sapna-ml-low-confidence'
          })
        };
      }

      throw new Error(`Unexpected ML fetch: ${url}`);
    });
    globalThis.fetch = fetchMock;

    const activity = await Activity.create({
      code: 'TST_ACTIVITY_FALLBACK',
      title: 'Fallback activity',
      description: 'Fallback route fixture',
      domain: 'cognitive',
      ageBandMinMonths: 12,
      ageBandMaxMonths: 36,
      estimatedMinutes: 10,
      instructions: ['Test']
    });

    await authRequest().post('/api/consent').send({
      acknowledgedScreeningOnly: true,
      acknowledgedDataUse: true
    });
    const childRes = await authRequest().post('/api/children').send({
      nickname: 'FallbackKid',
      dateOfBirth: '2024-01-01'
    });
    const childId = childRes.body.child._id;

    await authRequest().post('/api/logs').send({
      childId,
      activityId: String(activity._id),
      durationMinutes: 11,
      successLevel: 'completed',
      parentConfidence: 4
    });

    const reportRes = await authRequest().post('/api/reports/generate-weekly').send({ childId });
    expect(reportRes.status).toBe(201);
    expect(fetchMock).toHaveBeenCalled();
    expect(reportRes.body.report.predictionSource).toBe('rules_fallback');
    expect(reportRes.body.report.classProbabilities.at_risk).toBeGreaterThan(0);
    expect(reportRes.body.report.classProbabilities.needs_monitoring).toBeGreaterThan(0);
  });
});
