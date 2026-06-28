import { Router } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { requirePermission } from '../middleware/requirePermission.js';
import { logActivity } from '../repositories/activityLogs.js';
import * as settings from '../repositories/settings.js';

const execFileAsync = promisify(execFile);

const router = Router();

router.get('/', (req, res) => res.json(settings.get()));

router.put('/', requirePermission('settings.manage'), (req, res) => {
  const result = settings.update(req.body);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'update_settings' });
  res.json(result);
});

// Opens a native Windows folder-picker dialog and returns the chosen path (or null if cancelled).
router.get('/folder-picker', requirePermission('data.backup'), async (req, res) => {
  const script =
    'Add-Type -AssemblyName System.Windows.Forms; ' +
    '$d = New-Object System.Windows.Forms.FolderBrowserDialog; ' +
    '$d.Description = "Select backup destination folder"; ' +
    'if ($d.ShowDialog() -eq "OK") { Write-Output $d.SelectedPath }';
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
      timeout: 60000,
    });
    res.json({ path: stdout.trim() || null });
  } catch {
    res.json({ path: null });
  }
});

export default router;
