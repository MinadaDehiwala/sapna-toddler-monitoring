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
    }
  ]
};
