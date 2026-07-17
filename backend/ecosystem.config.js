// PM2 process config for deploying the API on a bare VM (without Docker).
//   pm2 start ecosystem.config.js --env production
//   pm2 save && pm2 startup   # survive reboots
//
// NOTE on scaling: Socket.IO keeps rooms in-memory, so running multiple
// instances (cluster) requires the Redis adapter + sticky sessions (Phase 9).
// Until then keep PM2_INSTANCES=1. Set it higher only after the Redis adapter
// is wired and Nginx is configured for ip_hash sticky sessions.
const instances = parseInt(process.env.PM2_INSTANCES, 10) || 1;

module.exports = {
  apps: [
    {
      name: 'laundromat-api',
      script: 'src/index.js',
      cwd: __dirname,
      instances,
      exec_mode: instances > 1 ? 'cluster' : 'fork',
      max_memory_restart: '400M',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      out_file: '/var/log/laundromat/api.out.log',
      error_file: '/var/log/laundromat/api.err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
