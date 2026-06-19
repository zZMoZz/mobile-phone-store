import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { UPLOADS_DIR, ensureDataDirs } from '../db/paths.js';

const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']);

const storage = multer.diskStorage({
  destination(req, file, cb) {
    ensureDataDirs();
    cb(null, UPLOADS_DIR);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `${randomUUID()}${ext}`);
  },
});

export const uploadProductImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED.has(ext)) return cb(null, true);
    const err = new Error('Unsupported image type');
    err.status = 400;
    cb(err);
  },
}).single('image');

/** Public URL for an uploaded file name, served under /uploads. */
export function uploadedUrl(filename) {
  return `/uploads/${filename}`;
}
