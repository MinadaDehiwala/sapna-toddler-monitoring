const firebaseAdmin = require('firebase-admin');
const { connectMongo } = require('../config/mongo');
const { initializeFirebase, isFirebaseConfigured } = require('../config/firebase');
const Parent = require('../models/Parent');

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1) return process.argv[index + 1] || fallback;
  return fallback;
}

async function findOrCreateParentByFirebaseEmail(email) {
  const firebaseUid = getArg('firebase-uid', '').trim();
  let parent = await Parent.findOne({ email });
  if (parent) return parent;

  if (firebaseUid) {
    return Parent.create({
      firebaseUid,
      email,
      displayName: ''
    });
  }

  if (!isFirebaseConfigured()) {
    throw new Error(`${email} was not found. Log in with that account once, then run this again.`);
  }

  const firebaseUser = await firebaseAdmin.auth().getUserByEmail(email);
  parent = await Parent.create({
    firebaseUid: firebaseUser.uid,
    email: firebaseUser.email || email,
    displayName: firebaseUser.displayName || ''
  });
  return parent;
}

async function grantAdmin() {
  const email = getArg('email', 'admin@gmail.com').toLowerCase().trim();
  if (!email) {
    throw new Error('Usage: npm run admin:grant -- --email admin@gmail.com');
  }

  initializeFirebase();
  await connectMongo();

  const parent = await findOrCreateParentByFirebaseEmail(email);
  parent.role = 'admin';
  await parent.save();

  console.log(`Granted admin role to ${email}`);
  process.exit(0);
}

if (require.main === module) {
  grantAdmin().catch((error) => {
    console.error('Failed to grant admin role', error.message || error);
    process.exit(1);
  });
}

module.exports = { grantAdmin, findOrCreateParentByFirebaseEmail };
