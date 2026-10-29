'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

function acquireMaintenanceLock(options = {}) {
  const directory = options.directory || path.join(process.env.LOCALAPPDATA || os.homedir(), '.smithue');
  const lockPath = path.join(directory, 'maintenance.lock');
  fs.mkdirSync(directory, { recursive: true });

  if (options.inherit !== false && process.env.SMITHUE_MAINTENANCE_TOKEN) {
    try {
      const owner = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (String(owner.pid) === process.env.SMITHUE_MAINTENANCE_OWNER_PID
          && owner.token === process.env.SMITHUE_MAINTENANCE_TOKEN) {
        process.kill(owner.pid, 0);
        return () => {};
      }
    } catch (_) {}
  }

  let descriptor;
  try {
    descriptor = fs.openSync(lockPath, 'wx', 0o600);
  } catch (error) {
    if (['EEXIST', 'EACCES', 'EPERM', 'EBUSY'].includes(error.code)) {
      throw new Error(`SmithUE maintenance is locked: ${lockPath}. Retry after the owning process completes. If abandoned, verify the recorded PID is dead before removing the lock.`);
    }
    throw error;
  }

  const owner = { pid: process.pid, token: randomUUID(), owner: 'cli' };
  try {
    fs.writeFileSync(descriptor, JSON.stringify(owner));
    fs.fsyncSync(descriptor);
  } catch (error) {
    fs.closeSync(descriptor);
    fs.unlinkSync(lockPath);
    throw error;
  }

  const previousPid = process.env.SMITHUE_MAINTENANCE_OWNER_PID;
  const previousToken = process.env.SMITHUE_MAINTENANCE_TOKEN;
  process.env.SMITHUE_MAINTENANCE_OWNER_PID = String(owner.pid);
  process.env.SMITHUE_MAINTENANCE_TOKEN = owner.token;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    process.removeListener('exit', release);
    fs.closeSync(descriptor);
    try {
      const current = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (current.pid === owner.pid && current.token === owner.token) fs.unlinkSync(lockPath);
    } catch (_) {}
    if (previousPid === undefined) delete process.env.SMITHUE_MAINTENANCE_OWNER_PID;
    else process.env.SMITHUE_MAINTENANCE_OWNER_PID = previousPid;
    if (previousToken === undefined) delete process.env.SMITHUE_MAINTENANCE_TOKEN;
    else process.env.SMITHUE_MAINTENANCE_TOKEN = previousToken;
  };
  process.on('exit', release);
  return release;
}

module.exports = { acquireMaintenanceLock };