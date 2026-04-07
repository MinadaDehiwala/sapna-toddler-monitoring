const createError = require('http-errors');
const Parent = require('../models/Parent');
const { verifyFirebaseToken } = require('../config/firebase');

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  return token;
}

async function requireAuth(req, res, next) {
  const token = extractBearerToken(req);

  if (!token) {
    return next(createError(401, 'Missing Bearer token.'));
  }

  try {
    const decoded = await verifyFirebaseToken(token);

    if (!decoded.uid) {
      throw createError(401, 'Invalid Firebase token payload.');
    }

    const parent = await Parent.findOneAndUpdate(
      { firebaseUid: decoded.uid },
      {
        $setOnInsert: {
          firebaseUid: decoded.uid,
          displayName: decoded.name || ''
        },
        $set: {
          email: decoded.email || ''
        }
      },
      { new: true, upsert: true }
    );

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
