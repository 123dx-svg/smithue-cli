import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [editor, project, pluginDirectory, peerEditor, peerProject] = process.argv.slice(2);
if (!editor || !project || !pluginDirectory) {
  throw new Error('Usage: node scripts/verify-multi-instance.mjs <UnrealEditor.exe> <project.uproject> <SmithUE-plugin-directory> [peer-UnrealEditor.exe peer-project.uproject]');
}
if (Boolean(peerEditor) !== Boolean(peerProject)) throw new Error('Specify both the peer editor and peer project.');
const projectDescriptor = JSON.parse(await readFile(resolve(project), 'utf8'));
const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const root = await mkdtemp(join(tmpdir(), 'smithue-multi-instance-'));
const secondProject = join(root, 'Second', 'SmithUESecond.uproject');
await mkdir(dirname(secondProject), { recursive: true });
await writeFile(secondProject, JSON.stringify({
  FileVersion: 3, EngineAssociation: projectDescriptor.EngineAssociation,
  AdditionalPluginDirectories: [dirname(resolve(pluginDirectory))],
  Plugins: [{ Name: 'SmithUE', Enabled: true }],
}));
const env = { ...process.env, LOCALAPPDATA: root, SMITHUE_BIND_PORT: '13721' };
for (const key of ['SMITHUE_PORT', 'SMITHUE_PID', 'SMITHUE_PROJECT', 'SMITHUE_SESSION']) delete env[key];
const children = [];
const logs = new Map();

function launch(projectPath, executable = editor) {
  const child = spawn(executable, [projectPath, '-unattended', '-nullrhi', '-nosplash', '-nop4', '-nosound', '-stdout', '-FullStdOutLogOutput'], { env });
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
      if (!(response.status === 503 && typeof identity.ready !== 'boolean')) {
        assert.equal(identity.pid, child.pid, JSON.stringify(identity));
        assert.equal(identity.instance_id, instance.instance_id, JSON.stringify(identity));
        if (identity.ready) {
          if (projectDescriptor.EngineAssociation === '5.8' && child.spawnargs[0] === editor) {
            assert.equal(typeof identity.modal_active, 'boolean');
          }
          return instance;
        }
      }
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

async function waitForOnlineCount(expected) {
  const deadline = Date.now() + 30000;
  let result;
  do {
    result = await invoke(['instances', '--timeout', '10000']);
    assert.equal(result.code, 0, result.stderr);
    const snapshot = JSON.parse(result.stdout);
    assert.equal(snapshot.instances.some((instance) => instance.state === 'identity_mismatch'), false, result.stdout);
    if (snapshot.online_count === expected && snapshot.ready_count === expected) return snapshot;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  } while (Date.now() < deadline);
  assert.fail(result.stdout);
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
  const second = launch(peerProject ? resolve(peerProject) : secondProject, peerEditor ?? editor);
  const [instanceA, instanceB] = await Promise.all([waitReady(first), waitReady(second)]);
  assert.notEqual(instanceA.port, instanceB.port);
  assert.ok(instanceA.instance_id);
  assert.ok(instanceB.instance_id);
  assert.notEqual(instanceA.instance_id, instanceB.instance_id);
  console.log(`Independent ports: ${first.pid}=${instanceA.port}, ${second.pid}=${instanceB.port}`);
  await waitForOnlineCount(2);
  for (const headers of [
    { 'X-SmithUE-Expected-Pid': String(first.pid), 'X-SmithUE-Expected-Instance': instanceB.instance_id },
    { 'X-SmithUE-Expected-Pid': String(second.pid), 'X-SmithUE-Expected-Instance': instanceA.instance_id },
  ]) {
    const response = await fetch(`http://127.0.0.1:${instanceB.port}/api/v1/execute`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ command: 'ping', params: {} }),
    });
    assert.equal(response.status, 409);
    assert.match(await response.text(), /INSTANCE_MISMATCH/);
  }
  console.log('Verified online count and receiver-side stale identity rejection: passed');
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
  await waitForOnlineCount(1);
  const restarted = launch(resolve(project));
  const replacement = await waitReady(restarted);
  assert.notEqual(replacement.instance_id, instanceA.instance_id);
  assert.notEqual((await invoke(['--session', 'session-a', 'status'])).code, 0);
  assert.equal((await status('session-a', restarted.pid)).pid, restarted.pid);
  assert.equal((await status('session-b')).pid, second.pid);
  await waitForOnlineCount(2);
  console.log('Restart changes instance identity and requires explicit session rebind: passed');
} catch (error) {
  for (const child of children) {
    console.error(`Editor ${child.pid}: exit=${child.exitCode}, signal=${child.signalCode}`);
    console.error(logs.get(child).split(/\r?\n/).filter((line) => /SmithUE|Error:|Fatal|Assertion|crash/i.test(line)).slice(-30).join('\n'));
  }
  throw error;
} finally {
  await Promise.all(children.map(stop));
  await rm(root, { recursive: true, force: true, maxRetries: 5 });
}