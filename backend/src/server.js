const { app } = require('./app');
const { env } = require('./config/env');
const { connectMongo } = require('./config/mongo');
const { initializeFirebase, isFirebaseConfigured } = require('./config/firebase');

async function connectMongoWithRetry() {
  try {
    await connectMongo();
    console.log('MongoDB connection established.');
  } catch (error) {
    console.error(`MongoDB connection failed. Retrying in 15s. Reason: ${error.message}`);
    setTimeout(connectMongoWithRetry, 15000);
  }
}

async function start() {
  initializeFirebase();

  app.listen(env.port, () => {
    console.log(
      `toddler-monitoring-api listening on port ${env.port} | firebaseConfigured=${isFirebaseConfigured()}`
    );
  });

  connectMongoWithRetry();
}

start().catch((error) => {
  console.error('Failed to boot server', error);
  process.exit(1);
});
