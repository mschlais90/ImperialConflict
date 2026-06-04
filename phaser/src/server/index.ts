import { startServer } from './gameServer';

const START_TIME = new Date().toISOString();

// Log crashes and shutdowns so we can diagnose disconnects in Render logs
process.on('uncaughtException', (err) => {
  console.error(`[CRASH] Uncaught exception at ${new Date().toISOString()}:`, err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error(`[CRASH] Unhandled rejection at ${new Date().toISOString()}:`, reason);
});
process.on('SIGTERM', () => {
  console.log(`[SHUTDOWN] SIGTERM received at ${new Date().toISOString()} — server started at ${START_TIME}`);
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log(`[SHUTDOWN] SIGINT received at ${new Date().toISOString()}`);
  process.exit(0);
});

startServer().catch((err) => {
  console.error('[CRASH] Failed to start server:', err);
  process.exit(1);
});
