import { createApp } from './app.js';
import { config, isApiKeyConfigured } from './config.js';

const app = createApp();
const PORT = config.port;

const server = app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 Radox AI Gateway Backend Service`);
  console.log(`📡 Listening on http://localhost:${PORT}`);
  console.log(`⚙️  Environment: ${config.nodeEnv}`);
  console.log(`🔑 Provider Key: ${isApiKeyConfigured() ? 'Configured ✅' : 'NOT Configured (see .env) ⚠️'}`);
  console.log(`🌐 Base URL: ${config.radoxBaseUrl}`);
  console.log(`=========================================`);
});

// Graceful shutdown handling
const handleGracefulShutdown = (signal: string) => {
  console.log(`\nReceived ${signal}. Shutting down HTTP server gracefully...`);
  server.close(() => {
    console.log('HTTP server closed. Exiting process.');
    process.exit(0);
  });

  // Force close after 10 seconds if hanging
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
