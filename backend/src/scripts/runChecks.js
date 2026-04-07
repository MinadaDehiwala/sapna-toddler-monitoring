const mongoose = require('mongoose');
const { connectMongo } = require('../config/mongo');

(async function runChecks() {
  try {
    await connectMongo();
    console.log('MongoDB connectivity check passed.');
  } catch (error) {
    console.error('Check failed:', error.message);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  }
})();
