import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [editor, project, pluginDirectory] = process.argv.slice(2);
if (!editor || !project || !pluginDirectory) {
  throw new Error('Usage: node scripts/verify-multi-instance.mjs <UnrealEditor.exe> <project.uproject> <SmithUE-plugin-directory>');
}
const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const root = await mkdtemp(join(tmpdir(), 'smithue-multi-instance-'));
const secondProject = join(root, 'Second', 'SmithUESecond.uproject');
await mkdir(dirname(secondProject), { recursive: true });
await writeFile(secondProject, JSON.stringify({
  FileVersion: 3, EngineAssociation: '5.2',
  AdditionalPluginDirectories: [dirname(resolve(pluginDirectory))],
  Plugins: [{ Name: 'SmithUE', Enabled: true }],
}));
const env = { ...process.env, LOCALAPPDATA: root, SMITHUE_BIND_PORT: '13721' };
for (const key of ['SMITHUE_PORT', 'SMITHUE_PID', 'SMITHUE_PROJECT', 'SMITHUE_SESSION']) delete env[key];
const children = [];
const logs = new Map();

function launch(projectPath) {
  const child = spawn(editor, [projectPath, '-unattended', '-nullrhi', '-nosplash', '-nop4', '-nosound', '-stdout', '-FullStdOutLogOutput'], { env });
  children.push(child);
  logs.set(child, '');
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (data) => logs.set(child, (logs.get(child) + data.toString()).slice(-16000)));
  }
  return child;
}

async function waitReady(child) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Editor ${child.pid} exited: ${logs.get(child)}`);
    try {
      const instance = JSON.parse(await readFile(join(root, '.smithue', `${child.pid}.port`), 'utf8'));
      const response = await fetch(`http://127.0.0.1:${instance.port}/ready`, { signal: AbortSignal.timeout(2000) });
      const identity = await response.json();
      assert.equal(identity.pid, child.pid);
      if (identity.ready) return instance;
    } catch (error) {
      if (error.code === 'ERR_ASSERTION') throw error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Timed out waiting for editor ${child.pid}: ${logs.get(child)}`);
}

function invoke(args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [cli, '--terse', ...args], { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('error', rejectRun);
    child.on('close', (code) => resolveRun({ code, stdout, stderr }));
  });
}

async function status(session, pid) {
  const result = await invoke(['--session', session, ...(pid ? ['--pid', String(pid)] : []), 'status']);
  assert.equal(result.code, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolveStop) => {
    child.once('exit', resolveStop);
    child.kill();
  });
}

try {
  const first = launch(resolve(project));
  const second = launch(secondProject);
  const [instanceA, instanceB] = await Promise.all([waitReady(first), waitReady(second)]);
  assert.notEqual(instanceA.port, instanceB.port);
  console.log(`Independent ports: ${first.pid}=${instanceA.port}, ${second.pid}=${instanceB.port}`);
  assert.equal((await status('session-a', first.pid)).pid, first.pid);
  assert.equal((await status('session-b', second.pid)).pid, second.pid);
  assert.equal((await status('session-a')).pid, first.pid);
  assert.equal((await status('session-b')).pid, second.pid);
  assert.notEqual((await invoke(['status'])).code, 0);
  const ping = await invoke(['--session', 'session-a', 'exec', 'ping']);
  assert.equal(ping.code, 0, ping.stderr);
  console.log('Session isolation and ambiguous-target refusal: passed');
  await stop(first);
  assert.notEqual((await invoke(['--session', 'session-a', 'status'])).code, 0);
  assert.equal((await status('session-b')).pid, second.pid);
  console.log('Exited target refuses fallback; other session remains available: passed');
} finally {
  await Promise.all(children.map(stop));
  await rm(root, { recursive: true, force: true, maxRetries: 5 });
}