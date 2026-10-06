import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load our single-line .env configuration without relying on newer CLI flags.
export function parseEnv(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '').trim();
    result[match[1]] = value;
  }
  return result;
}
try {
  const values = parseEnv(readFileSync(resolve(process.cwd(), '.env'), 'utf8'));
  for (const [key, value] of Object.entries(values)) if (process.env[key] === undefined) process.env[key] = value;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
