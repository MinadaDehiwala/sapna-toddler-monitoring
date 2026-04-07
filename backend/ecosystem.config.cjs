module.exports = {
  apps: [
    {
      name: 'sapna-toddler-api',
      script: 'src/server.js',
      cwd: '/home/ec2-user/sapna-toddler-monitoring/backend',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '320M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'sapna-ml-api',
      script: '/home/ec2-user/sapna-toddler-monitoring/ml-service/venv/bin/python',
      args: '-m uvicorn app.main:app --host 127.0.0.1 --port 8010',
      cwd: '/home/ec2-user/sapna-toddler-monitoring/ml-service',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '220M',
      env: {
        ML_MODEL_BUNDLE_DIR: '/home/ec2-user/sapna-toddler-monitoring/ml-service/artifacts/production',
        PYTHONUNBUFFERED: '1'
      }
    }
  ]
};
