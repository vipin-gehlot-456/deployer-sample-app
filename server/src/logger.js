/**
 * Minimal structured (JSON lines) logger. Callers must never pass env values or secrets.
 *
 * @param {'info' | 'warn' | 'error'} level Log level.
 * @param {string} event Dotted event name, e.g. `server.listening`.
 * @param {Record<string, unknown>} [fields] Extra non-sensitive context.
 */
export function log(level, event, fields = {}) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}
