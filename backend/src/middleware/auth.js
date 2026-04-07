const createError = require('http-errors');
const Parent = require('../models/Parent');
const DeletedAccount = require('../models/DeletedAccount');
const { verifyFirebaseToken } = require('../config/firebase');
const { env } = require('../config/env');

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  return token;
}

async function requireAuth(req, res, next) {
  try {
    let decoded = null;
    const encodedTestUser = req.headers['x-test-user'];

    if (env.nodeEnv === 'test' && encodedTestUser) {
      try {
        const parsed = JSON.parse(Buffer.from(String(encodedTestUser), 'base64url').toString('utf8'));
        decoded = {
          uid: parsed.uid,
          email: parsed.email || ''
        };
      } catch (parseError) {
        throw createError(401, 'Invalid x-test-user header payload.');
      }
    } else {
      const token = extractBearerToken(req);
      if (!token) {
        throw createError(401, 'Missing Bearer token.');
      }
      decoded = await verifyFirebaseToken(token);
    }

    if (!decoded.uid) {
      throw createError(401, 'Invalid Firebase token payload.');
    }

    const tombstone = await DeletedAccount.findOne({ firebaseUid: decoded.uid }).lean();
    if (tombstone) {
      throw createError(
        403,
        'This account was deleted. Contact support if you need account restoration assistance.'
      );
    }

    let parent = await Parent.findOne({ firebaseUid: decoded.uid });
    if (!parent) {
      parent = await Parent.create({
        firebaseUid: decoded.uid,
        email: decoded.email || '',
        displayName: decoded.name || ''
      });
    } else if (decoded.email && parent.email !== decoded.email) {
      parent.email = decoded.email;
      await parent.save();
    }

    req.user = {
      uid: decoded.uid,
      email: decoded.email || '',
      token: decoded,
      parent
    };

    return next();
  } catch (error) {
    return next(createError(error.status || 401, error.message || 'Unauthorized.'));
  }
}

module.exports = { requireAuth };
