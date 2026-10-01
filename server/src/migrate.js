import { createPool } from './db.js';

/** Ordered, append-only list of migrations. Never edit an applied entry. */
const MIGRATIONS = [
  {
    version: '001',
    sql: `CREATE TABLE tasks (
      id serial PRIMARY KEY,
      title text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
];

// Serialises concurrent runners (e.g. several replicas starting at once).
const ADVISORY_LOCK_ID = 727_001;

/**
 * Apply pending migrations, each in its own transaction. Prints only applied versions.
 *
 * @param {string} connectionString PostgreSQL URL. Never printed.
 */
async function migrate(connectionString) {
  const pool = createPool(connectionString);
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_ID]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

    const { rows } = await client.query('SELECT version FROM schema_migrations');
    const appliedVersions = new Set(rows.map((row) => row.version));

    for (const migration of MIGRATIONS) {
      if (appliedVersions.has(migration.version)) continue;
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [migration.version]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
      console.log(`applied ${migration.version}`);
    }

    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
  } finally {
    client.release();
    await pool.end();
  }
}

const connectionString = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('migrate: MIGRATION_DATABASE_URL or DATABASE_URL must be set');
  process.exitCode = 1;
} else {
  try {
    await migrate(connectionString);
  } catch (err) {
    // Only the error code: messages can contain hostnames or user names.
    console.error(`migrate: failed${err.code ? ` (${err.code})` : ''}`);
    process.exitCode = 1;
  }
}
