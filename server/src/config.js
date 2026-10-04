// Central configuration: filesystem paths and runtime options.
// Kept tiny and dependency-free so every module can import it.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repository root (two levels up from server/src). */
export const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Default firmware rootfs the agents analyze (committed in Phase 0). */
export const DEFAULT_ROOTFS = path.join(REPO_ROOT, 'targets', 'iotgoat', 'rootfs');

/** Static dashboard files (the observer screen) served by the server. */
export const WEB_ROOT = path.join(REPO_ROOT, 'web');

/** Recorded event-stream runs (for the bulletproof replay demo). */
export const RECORDINGS_DIR = path.join(REPO_ROOT, 'recordings');

/** HTTP + WebSocket port. */
export const PORT = Number(process.env.PORT ?? 3000);
