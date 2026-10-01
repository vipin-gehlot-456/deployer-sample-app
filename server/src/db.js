import pg from 'pg';
import { log } from './logger.js';

const POOL_MAX_CLIENTS = 10;
const CONNECT_TIMEOUT_MS = 5000;
const IDLE_TIMEOUT_MS = 30000;

/**
 * Create a PostgreSQL connection pool.
 *
 * `ssl` is deliberately not set: pg derives it from `sslmode=` in the URL or
 * from `PGSSLMODE` (e.g. `require`), so TLS stays an environment decision.
 *
 * @param {string} connectionString PostgreSQL URL. Never logged.
 * @returns {pg.Pool}
 */
export function createPool(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    max: POOL_MAX_CLIENTS,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
  });

  // Without a listener, an error on an idle client would crash the process.
  pool.on('error', (err) => {
    log('error', 'db.idle_client_error', { code: err.code });
  });

  return pool;
}
