const admin = require('firebase-admin');
const { env } = require('./env');

let firebaseConfigured = false;

function initializeFirebase() {
  if (admin.apps.length > 0) {
    firebaseConfigured = true;
    return;
  }

  if (env.firebaseProjectId && env.firebaseClientEmail && env.firebasePrivateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.firebaseProjectId,
        clientEmail: env.firebaseClientEmail,
        privateKey: env.firebasePrivateKey
      })
    });
    firebaseConfigured = true;
    return;
  }

  if (env.firebaseProjectId) {
    admin.initializeApp({ projectId: env.firebaseProjectId });
    firebaseConfigured = true;
    return;
  }

  firebaseConfigured = false;
}

async function verifyFirebaseToken(idToken) {
  if (!firebaseConfigured) {
    const error = new Error('Firebase admin is not configured. Set Firebase env values.');
    error.status = 503;
    throw error;
  }

  return admin.auth().verifyIdToken(idToken);
}

function isFirebaseConfigured() {
  return firebaseConfigured;
}

module.exports = {
  initializeFirebase,
  verifyFirebaseToken,
  isFirebaseConfigured
};
