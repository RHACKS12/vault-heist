// Central configuration: filesystem paths and runtime options.
// Kept tiny and dependency-free so every module can import it.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repository root (two levels up from server/src). */
export const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Default firmware rootfs the agents analyze (committed in Phase 0). */
export const DEFAULT_ROOTFS = path.join(REPO_ROOT, 'targets', 'iotgoat', 'rootfs');

/** HTTP + WebSocket port. */
export const PORT = Number(process.env.PORT ?? 3000);
