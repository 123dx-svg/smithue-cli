import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const { acquireMaintenanceLock } = require('../scripts/maintenance-lock.cjs') as {
  acquireMaintenanceLock(options?: { directory?: string; inherit?: boolean }): () => void;
};