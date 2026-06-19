import { createApp } from './app.js';
import { seed } from './db/seed.js';
import { runScheduledBackup } from './lib/backup.js';

const PORT = process.env.PORT || 4000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Ensure schema + default reference data exist before serving.
seed();

const app = createApp();

app.listen(PORT, () => {
  console.log(`Mobile Phone Store server running at http://localhost:${PORT}`);
  // Back up on startup, then once a day while running (each call is error-safe).
  runScheduledBackup();
  setInterval(runScheduledBackup, DAY_MS);
});
