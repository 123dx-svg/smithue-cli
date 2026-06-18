import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

/**
 * Derive a stable, short identifier for an absolute project path.
 * Inspired by Obsidian's path-hash vault identity — survives pid/port changes.
 *
 * Algorithm: normalize path (resolve + lowercase on Windows) → SHA-256 → first 16 hex chars.
 */
export function projectId(absPath: string): string {
  const normalized = normalizePath(absPath);
  return createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 16);
}

function normalizePath(p: string): string {
  const resolved = resolve(p);
  // Windows paths are case-insensitive; normalize to lowercase for stable hashing
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
