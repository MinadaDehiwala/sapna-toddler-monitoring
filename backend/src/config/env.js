const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3010),
  mongodbUri: process.env.MONGODB_URI,
  frontendOrigins: (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean),
  consentVersion: process.env.CONSENT_VERSION || '1.0',
  reportDisclaimer:
    process.env.REPORT_DISCLAIMER ||
    'This tool is a developmental screening and monitoring aid, not a medical diagnosis. Please consult a qualified healthcare professional for formal assessment.',
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : null
};

module.exports = { env };
