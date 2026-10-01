import http from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createPool } from './db.js';
import { log } from './logger.js';

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const SERVE_STATIC = process.env.SERVE_STATIC === '1';
const STATIC_DIR = fileURLToPath(new URL('../../client/dist', import.meta.url));

const READY_TIMEOUT_MS = 2000;
const SHUTDOWN_TIMEOUT_MS = 10000;
const TASK_TITLE_MAX_LENGTH = 200;
const TASK_LIST_LIMIT = 100;
const JSON_BODY_LIMIT = '10kb';

const pool = process.env.DATABASE_URL ? createPool(process.env.DATABASE_URL) : null;

function errorBody(code, message) {
  return { error: { code, message } };
}

/** Run `SELECT 1`, rejecting if it takes longer than READY_TIMEOUT_MS. */
async function pingDatabase() {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('readiness timeout')), READY_TIMEOUT_MS);
  });
  try {
    await Promise.race([pool.query('SELECT 1'), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function requireDatabase(req, res, next) {
  if (!pool) {
    res.status(503).json(errorBody('DB_NOT_CONFIGURED', 'Database is not configured'));
    return;
  }
  next();
}

const api = express.Router();

api.get('/health/live', (req, res) => {
  res.json({ status: 'ok' });
});

api.get('/health/ready', async (req, res) => {
  if (!pool) {
    res.status(503).json({ status: 'not_ready', db: 'not_configured' });
    return;
  }
  try {
    await pingDatabase();
    res.json({ status: 'ready', db: 'ok' });
  } catch (err) {
    log('warn', 'health.ready_failed', { code: err.code });
    res.status(503).json({ status: 'not_ready', db: 'error' });
  }
});

api.get('/tasks', requireDatabase, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, title, created_at FROM tasks ORDER BY id DESC LIMIT $1',
    [TASK_LIST_LIMIT],
  );
  res.json({ data: rows });
});

api.post('/tasks', requireDatabase, async (req, res) => {
  const rawTitle = req.body?.title;
  const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
  if (title.length < 1 || title.length > TASK_TITLE_MAX_LENGTH) {
    res
      .status(422)
      .json(errorBody('VALIDATION_ERROR', `title must be 1-${TASK_TITLE_MAX_LENGTH} characters`));
    return;
  }
  const { rows } = await pool.query(
    'INSERT INTO tasks (title) VALUES ($1) RETURNING id, title, created_at',
    [title],
  );
  res.status(201).json({ data: rows[0] });
});

api.use((req, res) => {
  res.status(404).json(errorBody('NOT_FOUND', 'Route not found'));
});

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use('/api', api);

if (SERVE_STATIC) {
  app.use(express.static(STATIC_DIR));
  // SPA fallback: any other GET/HEAD outside /api gets the client entry point.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.sendFile('index.html', { root: STATIC_DIR });
  });
}

// Express 5 forwards rejected async handlers here. Never echo internal error details.
app.use((err, req, res, next) => {
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) log('error', 'request.failed', { method: req.method, path: req.path, code: err.code });
  if (res.headersSent) return next(err);
  res
    .status(status)
    .json(errorBody(status === 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST', status === 500 ? 'Internal server error' : 'Bad request'));
});

const server = http.createServer(app);

server.on('error', (err) => {
  log('error', 'server.start_failed', { code: err.code });
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  log('info', 'server.listening', { serveStatic: SERVE_STATIC, dbConfigured: Boolean(pool) });
});

function shutdown(signal) {
  log('info', 'server.shutdown', { signal });
  setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
  server.close(async () => {
    try {
      await pool?.end();
    } catch (err) {
      log('error', 'db.close_failed', { code: err.code });
    }
    process.exit(0);
  });
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
