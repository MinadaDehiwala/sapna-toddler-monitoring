const mongoose = require('mongoose');
const { env } = require('./env');

async function connectMongo() {
  if (!env.mongodbUri) {
    throw new Error('Missing MONGODB_URI environment variable.');
  }

  await mongoose.connect(env.mongodbUri, {
    serverSelectionTimeoutMS: 10000
  });
}

module.exports = { connectMongo };
