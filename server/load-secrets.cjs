'use strict';

/**
 * Startup loader for the `_FILE` secret convention.
 *
 * For every env var named `<KEY>_FILE`, the file it points to is read into
 * `process.env[<KEY>]` unless `<KEY>` is already set. Values and file contents
 * are never printed. Used via `node --require ./server/load-secrets.cjs ...`.
 */

const FILE_SUFFIX = '_FILE';
const EXIT_CONFIG_ERROR = 78; // EX_CONFIG from sysexits.h

class SecretFileError extends Error {
  constructor(fileKey) {
    super(`load-secrets: cannot read ${fileKey}`);
    this.name = 'SecretFileError';
    this.key = fileKey;
  }
}

function isSet(value) {
  return value !== undefined && value !== '';
}

/**
 * Load `<KEY>_FILE` secrets into `<KEY>`.
 *
 * @param {Record<string, string | undefined>} [env=process.env] Environment to read and update.
 * @param {{ readFileSync: Function }} [fs=require('node:fs')] File system implementation.
 * @returns {string[]} Base keys that were loaded from files.
 * @throws {SecretFileError} When a referenced file cannot be read.
 */
function loadSecretFiles(env = process.env, fs = require('node:fs')) {
  const loadedKeys = [];

  for (const fileKey of Object.keys(env)) {
    if (!fileKey.endsWith(FILE_SUFFIX) || fileKey.length === FILE_SUFFIX.length) continue;

    const filePath = env[fileKey];
    if (!isSet(filePath)) continue;

    const baseKey = fileKey.slice(0, -FILE_SUFFIX.length);
    if (isSet(env[baseKey])) {
      console.warn(`load-secrets: ${baseKey} and ${fileKey} are both set; using ${baseKey}`);
      continue;
    }

    let contents;
    try {
      contents = fs.readFileSync(filePath, 'utf8');
    } catch {
      throw new SecretFileError(fileKey);
    }

    env[baseKey] = contents.replace(/\r?\n$/, '');
    loadedKeys.push(baseKey);
  }

  return loadedKeys;
}

module.exports = { loadSecretFiles };

if (process.env.LOAD_SECRETS_DISABLE_AUTORUN !== '1') {
  try {
    loadSecretFiles();
  } catch (err) {
    if (!(err instanceof SecretFileError)) throw err;
    console.error(err.message);
    process.exit(EXIT_CONFIG_ERROR);
  }
}
