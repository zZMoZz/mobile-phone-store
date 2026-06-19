import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { ROOT_DIR, UPLOADS_DIR, ASSETS_DIR } from './db/paths.js';
import apiRouter from './routes/index.js';

/**
 * Builds the Express application. Kept separate from index.js so tests can
 * import the app without starting an HTTP listener.
 */
export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  // Static: bundled default assets and user-uploaded product images.
  app.use('/assets', express.static(ASSETS_DIR));
  app.use('/uploads', express.static(UPLOADS_DIR));

  // REST API
  app.use('/api', apiRouter);

  // In production, serve the built React client and fall back to index.html
  // for client-side routing. (In dev the client is served by Vite.)
  const clientDist = path.join(ROOT_DIR, 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  // JSON error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    // `code` (+ optional `params`) let the client show a localized message;
    // `error` remains the English fallback. Undefined fields are omitted by JSON.
    res.status(status).json({ error: err.message || 'Internal server error', code: err.code, params: err.params });
  });

  return app;
}
