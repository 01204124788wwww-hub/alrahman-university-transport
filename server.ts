// Disable Vite HMR in AI Studio development server to prevent iframe WebSocket connection errors
process.env.DISABLE_HMR = 'true';

import http from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrapPlatform } from './server/db';
import { apiRouter } from './server/routes';
import { verifyDatabaseStartup, isPostgresConfigured } from './server/postgres_adapter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  // 1. Verify database configuration & health (strictly prevents fallback to SQLite if PostgreSQL fails)
  await verifyDatabaseStartup();

  // 2. Run idempotent bootstrap for database, platform owner, and initial branches (on local SQLite)
  if (!isPostgresConfigured()) {
    bootstrapPlatform();
  }

  const app = express();
  const server = http.createServer(app);
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json());
  app.use(cookieParser());

  // Mount API router under /api
  app.use('/api', apiRouter);

  if (!isProd) {
    // In development mode, mount Vite middleware attached to the HTTP server
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: { server },
        ws: { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production mode, serve built static assets from dist
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Al-Rahman Full-Stack Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[FATAL] Failed to start server:', err);
  process.exit(1);
});
