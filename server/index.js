import { createApp } from './app.js';
import { seed } from './db/seed.js';
import { runScheduledBackup, getLastBackupAt } from './lib/backup.js';
import { get as getSettings } from './repositories/settings.js';
import { getMachineId } from './lib/machine.js';

const PORT = process.env.PORT || 4000;
const HOUR_MS = 60 * 60 * 1000;

// Verify we can read the machine ID before doing anything else.
// This also warms the cache so the license middleware never hits the registry again.
try {
  getMachineId();
} catch (e) {
  console.error('\n[License] Cannot read machine ID:', e.message);
  console.error('[License] This application requires Windows to run.\n');
  process.exit(1);
}

// Ensure schema + default reference data exist before serving.
seed();

const app = createApp();

app.listen(PORT, () => {
  console.log(`Mobile Phone Store server running at http://localhost:${PORT}`);

  // Login, logout, and browser close all trigger a backup (routes/auth.js + AuthContext beforeunload).
  // A 5-minute cooldown in runScheduledBackup prevents duplicates from rapid login/logout.
  // This interval catches long sessions where neither event fires for a while.
  setInterval(async () => {
    const intervalHours = getSettings()?.backup_interval_hours || 12;
    if (Date.now() - getLastBackupAt() >= intervalHours * HOUR_MS) {
      await runScheduledBackup();
    }
  }, HOUR_MS);
});
