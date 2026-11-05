import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { join } from 'path';

/**
 * Per-user data profile. The gateway derives everything (data/, .env.generated, .api-key, session
 * creds, media) from process.cwd(), so we simply fork it with cwd set here and the whole install is
 * isolated per user and survives upgrades. Nothing is written into the read-only app.asar / install
 * directory.
 */
export function profileDir(): string {
  const dir = app.getPath('userData');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** The media storage root the gateway uses; kept inside the profile. */
export function mediaDir(): string {
  return join(profileDir(), 'data', 'media');
}

/**
 * A stable secret persisted at 0600 in the profile. Used for API_MASTER_KEY / API_KEY_PEPPER so the
 * admin key derived on first boot stays identical across launches (a rotating pepper would lock
 * every stored key out — see main.ts's pepper warning).
 */
function persistedSecret(name: string, bytes: number): string {
  const file = join(profileDir(), `.secret-${name}`);
  if (existsSync(file)) {
    return readFileSync(file, 'utf8').trim();
  }
  const value = randomBytes(bytes).toString('hex');
  writeFileSync(file, value, { mode: 0o600 });
  try {
    // mode is only a hint on the create path; reassert in case the file pre-existed with loose perms.
    writeFileSync(file, value, { mode: 0o600 });
  } catch {
    /* best-effort */
  }
  return value;
}

export function apiMasterKey(): string {
  return persistedSecret('api-master-key', 32);
}

export function apiKeyPepper(): string {
  return persistedSecret('api-key-pepper', 32);
}
