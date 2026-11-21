import { spawnSync } from 'node:child_process';
import { config } from 'dotenv';

config({ path: process.env.COMPVISTA_ENV_FILE ?? '.env' });
if (!process.env.COMPVISTA_ENV_FILE) config({ path: '../.env.local' });

const direct = process.env.DIRECT_URL;
if (!direct) throw new Error('DIRECT_URL is required for Flyway');
const url = new URL(direct);
if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
  throw new Error('DIRECT_URL must be a PostgreSQL URL');
}
const jdbc = new URLSearchParams(url.search);
jdbc.set('sslmode', 'require');
const env = {
  ...process.env,
  FLYWAY_URL: `jdbc:postgresql://${url.hostname}:${url.port || '5432'}${url.pathname}?${jdbc}`,
  FLYWAY_USER: decodeURIComponent(url.username),
  FLYWAY_PASSWORD: decodeURIComponent(url.password),
  FLYWAY_LOCATIONS: 'filesystem:db/migration',
};
const command = process.env.FLYWAY_COMMAND ?? 'flyway';
const action = process.argv[2];
if (!['migrate', 'validate', 'info'].includes(action)) throw new Error('Unsupported Flyway action');
const result = spawnSync(command, [action], { env, stdio: 'inherit', shell: process.platform === 'win32' });
if (result.error) {
  console.error('Flyway CLI is unavailable. Install Flyway or set FLYWAY_COMMAND to its executable path.');
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
