const { env } = require('../config/env');

function isMlEnabled() {
  return Boolean(env.mlServiceEnabled);
}

async function fetchWithTimeout(path, options = {}, timeoutMs = env.mlServiceTimeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${env.mlServiceUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.detail || payload?.error || `ML service request failed with ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function getMlPrediction(features) {
  if (!isMlEnabled()) {
    return null;
  }

  return fetchWithTimeout(
    '/predict',
    {
      method: 'POST',
      body: JSON.stringify({ features })
    },
    env.mlServiceTimeoutMs
  );
}

async function getMlHealth() {
  if (!isMlEnabled()) {
    return {
      mlServiceReachable: false,
      mlModelVersion: null,
      mlServiceEnabled: false
    };
  }

  try {
    const payload = await fetchWithTimeout('/health', { method: 'GET' }, env.mlHealthTimeoutMs);
    return {
      mlServiceReachable: Boolean(payload.ok),
      mlModelVersion: payload.modelVersion || null,
      mlServiceEnabled: true
    };
  } catch (error) {
    return {
      mlServiceReachable: false,
      mlModelVersion: null,
      mlServiceEnabled: true,
      mlError: error.message
    };
  }
}

module.exports = {
  isMlEnabled,
  getMlPrediction,
  getMlHealth
};
