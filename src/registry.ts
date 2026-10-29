import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { getPortfileDir } from './portfile.js';

export interface RegistryEntry {
  instance_id?: string;
  projectId: string;
  pid: number;
  port: number;
  project: string;
  project_name: string;
  lastConnectedAt: string;
}

export interface Registry {
  entries: RegistryEntry[];
  pinned?: RegistryEntry;
}

function getRegistryPath(): string {
  const session = process.env['SMITHUE_SESSION'];
  if (session) {
    const key = createHash('sha256').update(session).digest('hex');
    return join(getPortfileDir(), 'sessions', `${key}.json`);
  }
  return join(getPortfileDir(), 'last-used.json');
}

export async function readRegistry(): Promise<Registry> {
  try {
    const raw = await readFile(getRegistryPath(), 'utf-8');
    return JSON.parse(raw) as Registry;
  } catch {
    return { entries: [] };
  }
}

export async function updateLastUsed(entry: RegistryEntry): Promise<void> {
  const reg = await readRegistry();
  reg.entries = reg.entries.filter((e) => e.projectId !== entry.projectId);
  reg.entries.unshift(entry);
  reg.entries = reg.entries.slice(0, 20);
  await writeRegistryAtomic(reg);
}

export async function getPinned(): Promise<RegistryEntry | undefined> {
  const reg = await readRegistry();
  return reg.pinned;
}

export async function setPinned(entry: RegistryEntry): Promise<void> {
  const reg = await readRegistry();
  reg.pinned = entry;
  await writeRegistryAtomic(reg);
}

export async function clearPinned(): Promise<void> {
  const reg = await readRegistry();
  delete reg.pinned;
  await writeRegistryAtomic(reg);
}

export async function getMostRecent(): Promise<RegistryEntry | undefined> {
  const reg = await readRegistry();
  return reg.entries[0];
}

async function writeRegistryAtomic(reg: Registry): Promise<void> {
  const path = getRegistryPath();
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(reg, null, 2), 'utf-8');
  await rename(tmp, path);
}
