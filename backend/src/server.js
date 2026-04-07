const { app } = require('./app');
const { env } = require('./config/env');
const { connectMongo } = require('./config/mongo');
const { initializeFirebase, isFirebaseConfigured } = require('./config/firebase');
const mongoose = require('mongoose');

let httpServer = null;
let mongoRetryTimer = null;
let shuttingDown = false;

async function connectMongoWithRetry() {
  if (shuttingDown) {
    return;
  }

  try {
    await connectMongo();
    console.log('MongoDB connection established.');
  } catch (error) {
    console.error(`MongoDB connection failed. Retrying in 15s. Reason: ${error.message}`);
    mongoRetryTimer = setTimeout(connectMongoWithRetry, 15000);
  }
}

async function closeMongoConnection() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
  }
}

function setupGracefulShutdown() {
  async function shutdown(signal) {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`Received ${signal}. Starting graceful shutdown...`);

    if (mongoRetryTimer) {
      clearTimeout(mongoRetryTimer);
      mongoRetryTimer = null;
    }

    const forceExitTimer = setTimeout(() => {
      console.error('Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, 15000);

    try {
      if (httpServer) {
        await new Promise((resolve, reject) => {
          httpServer.close((error) => (error ? reject(error) : resolve()));
        });
        console.log('HTTP server closed.');
      }

      await closeMongoConnection();
      clearTimeout(forceExitTimer);
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExitTimer);
      console.error('Error during graceful shutdown', error);
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function start() {
  initializeFirebase();
  setupGracefulShutdown();

  httpServer = app.listen(env.port, () => {
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
