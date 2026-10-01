import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.LOAD_SECRETS_DISABLE_AUTORUN = '1';
const require = createRequire(import.meta.url);
const { loadSecretFiles } = require('../load-secrets.cjs');

function writeSecretFile(t, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'load-secrets-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, 'DATABASE_URL');
  fs.writeFileSync(filePath, contents);
  return filePath;
}

test('loads KEY from KEY_FILE and trims one trailing newline', (t) => {
  const env = { DATABASE_URL_FILE: writeSecretFile(t, 'file-value\n') };

  assert.deepEqual(loadSecretFiles(env), ['DATABASE_URL']);
  assert.equal(env.DATABASE_URL, 'file-value');
});

test('explicit value wins over KEY_FILE and the warning omits values', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const env = { DATABASE_URL: 'explicit-value', DATABASE_URL_FILE: writeSecretFile(t, 'file-value\n') };

  assert.deepEqual(loadSecretFiles(env), []);
  assert.equal(env.DATABASE_URL, 'explicit-value');
  assert.equal(warn.mock.callCount(), 1);
  const message = warn.mock.calls[0].arguments.join(' ');
  assert.match(message, /DATABASE_URL/);
  assert.doesNotMatch(message, /explicit-value|file-value/);
});

test('unreadable KEY_FILE throws a message naming only the key', () => {
  const env = { SESSION_SECRET_FILE: path.join(os.tmpdir(), 'does-not-exist', 'SESSION_SECRET') };

  assert.throws(() => loadSecretFiles(env), { message: 'load-secrets: cannot read SESSION_SECRET_FILE' });
});
