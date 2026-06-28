import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { DB_PATH } from '../db/paths.js';

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

const DEFAULT_PASSWORD = 'admin123';
const hash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);

const result = db.prepare(`
  UPDATE users
  SET password_hash      = ?,
      force_password_change = 1,
      recovery_code_hash = NULL,
      token_version      = token_version + 1
  WHERE role = 'owner'
`).run(hash);

if (result.changes > 0) {
  console.log('');
  console.log('Owner password has been reset.');
  console.log('  New password : admin123');
  console.log('  On next login you will be required to set a new password.');
  console.log('  A new recovery code will be displayed after the password change.');
  console.log('');
} else {
  console.log('No owner account found. Run "npm run seed" first.');
}

db.close();
