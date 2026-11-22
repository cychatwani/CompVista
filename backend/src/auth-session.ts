import { setTimeout as delay } from 'node:timers/promises';
import { auth } from './auth.js';

function databaseUnreachable(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
    if ('code' in current && current.code === 'P1001') return true;
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}

export async function getSessionFromCookie(cookie?: string) {
  const headers = new Headers({ cookie: cookie ?? '' });
  for (const waitMs of [250, 750, 1500]) {
    try {
      return await auth.api.getSession({ headers });
    } catch (error) {
      if (!databaseUnreachable(error)) throw error;
      await delay(waitMs);
    }
  }
  return auth.api.getSession({ headers });
}
