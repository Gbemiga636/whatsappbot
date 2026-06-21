/**
 * Structured logging for production observability.
 * Outputs JSON in production, readable text in development.
 */

const isProd = process.env.NODE_ENV === 'production';

function format(level, message, meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...meta,
  };
  if (isProd) return JSON.stringify(entry);
  const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `[${entry.ts}] ${level.toUpperCase()} ${message}${extra}`;
}

module.exports = {
  info: (msg, meta) => console.log(format('info', msg, meta)),
  warn: (msg, meta) => console.warn(format('warn', msg, meta)),
  error: (msg, meta) => console.error(format('error', msg, meta)),
  debug: (msg, meta) => {
    if (!isProd) console.log(format('debug', msg, meta));
  },
};
