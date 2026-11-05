import { createServer } from 'net';

/**
 * Reserve a free loopback port by binding an ephemeral server on 127.0.0.1, reading the assigned
 * port, then closing it. There is a small TOCTOU window between close and the gateway re-binding,
 * but the gateway only needs one port and we restart-with-backoff on EADDRINUSE, so a collision
 * self-heals. Binding explicitly to 127.0.0.1 (not 0.0.0.0) keeps the reservation on loopback.
 */
export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr === null || typeof addr === 'string') {
        srv.close(() => reject(new Error('Failed to reserve a loopback port')));
        return;
      }
      const { port } = addr;
      srv.close(() => resolve(port));
    });
  });
}
