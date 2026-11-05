import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { profileDir } from './profile';

/**
 * The gateway generates an admin API key on first boot and stores it (raw) at data/.api-key in its
 * working directory, which is the profile dir. The file has no trailing newline (see README), so we
 * trim on read. Used to prefill the desktop sign-in without the user opening a terminal.
 */
export function readBootstrapApiKey(): string | undefined {
  const file = join(profileDir(), 'data', '.api-key');
  if (!existsSync(file)) return undefined;
  const key = readFileSync(file, 'utf8').trim();
  return key.length > 0 ? key : undefined;
}
