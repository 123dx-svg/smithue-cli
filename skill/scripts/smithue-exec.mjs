#!/usr/bin/env node
// SmithUE exec — 跨 shell / UTF-8 安全的调用后路。
//
// 何时用：当 CLI 的 shell 传参出格式问题时——PowerShell 吞引号/拆参数、
// Windows 管道把中文(CJK)编码成 GBK 变 `??`、cmd 与 bash 转义规则打架。
// 本脚本用 Node 直读 UTF-8 文件 + 直发 HTTP，完全不经 shell 引号解析与
// 管道编码，因此在任何机器/任何 shell 上行为一致。纯内置模块，无依赖。
//
// 用法：
//   node smithue-exec.mjs <command> <params.json>     # 从文件读参数（推荐，UTF-8 最稳）
//   node smithue-exec.mjs <command> -                 # 从 stdin 读（管道 UTF-8）
//   node smithue-exec.mjs <command> '{"k":"v"}'       # 直接 JSON（仅 ASCII 安全时用）
//   node smithue-exec.mjs <command>                   # 无参数 = {}
//
// 注意：<command> 是 exec 的**工具名**（如 ping / list_assets / get_job_status /
// move_folder），等价于 `smithue-cli exec <command>`；不是 CLI 顶层子命令
// （status / list / search 走别的入口，用这个脚本会返回 "Unknown command"）。
//
// 环境变量：
//   SMITHUE_PORT=<n>       跳过端口发现，直连
//   SMITHUE_PROJECT=<path or name>   select an exact project
//   SMITHUE_PID=<n>                 select a unique editor process
//   SMITHUE_SESSION=<id>            reuse a CLI session binding

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';

function portDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || os.homedir(), '.smithue');
  }
  return path.join(process.env.XDG_RUNTIME_DIR || os.homedir(), '.smithue');
}

function discover() {
  const session = process.env.SMITHUE_SESSION;
  if (process.env.SMITHUE_PORT) {
    if (session || process.env.SMITHUE_PID || process.env.SMITHUE_PROJECT) {
      throw new Error('SMITHUE_PORT cannot be combined with a session, PID or project target.');
    }
    const port = Number(process.env.SMITHUE_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SMITHUE_PORT.');
    return { port };
  }
  const dir = portDir();
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.port')); } catch { /* no dir */ }
  const want = process.env.SMITHUE_PROJECT;
  let entries = files
    .map((f) => {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        j._mtime = fs.statSync(path.join(dir, f)).mtimeMs;
        return j;
      } catch { return null; }
    })
    .filter(Boolean)
    .filter((entry) => !process.env.SMITHUE_PID || entry.pid === Number(process.env.SMITHUE_PID))
    .filter((entry) => !want || String(entry.project_name || '') === want
      || path.resolve(entry.project).toLowerCase() === path.resolve(want).toLowerCase());
  if (session && !want && !process.env.SMITHUE_PID) {
    const key = createHash('sha256').update(session).digest('hex');
    let pinned;
    try { pinned = JSON.parse(fs.readFileSync(path.join(dir, 'sessions', `${key}.json`), 'utf8')).pinned; } catch {}
    if (!pinned) throw new Error('Session has no editor binding. Bind it with smithue-cli --session <id> --pid <pid> status first.');
    entries = entries.filter((entry) => entry.pid === pinned.pid && entry.port === pinned.port
      && entry.instance_id === pinned.instance_id
      && path.resolve(entry.project).toLowerCase() === path.resolve(pinned.project).toLowerCase());
  }
  if (!entries.length) {
    throw new Error(
      `No running SmithUE editor found (port dir: ${dir}). ` +
      `Start UE with the SmithUE plugin, or set SMITHUE_PORT=<n>.`
    );
  }
  if (entries.length !== 1) throw new Error('Multiple editors match. Select a unique SMITHUE_PID or bind SMITHUE_SESSION.');
  return entries[0];
}

function post(port, command, params, identity) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify({ command, params }), 'utf8'); // Content-Length 按字节算
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/api/v1/execute',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length,
          'X-SmithUE-Expected-Pid': String(identity.pid),
          'X-SmithUE-Expected-Instance': identity.instance_id,
        },
        timeout: 3_600_000, // 长命令不主动断；超时只是本地放弃等待，命令仍在编辑器里跑
      },
      (res) => {
        let d = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Target rejected the request (HTTP ${res.statusCode}). Do not retry or switch editors. ${d}`));
          } else resolve(d);
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () =>
      req.destroy(new Error('local wait timed out — the command may still be running; poll: get_job_status {}'))
    );
    req.write(body);
    req.end();
  });
}

async function main() {
  const [command, paramsArg] = process.argv.slice(2);
  if (!command) {
    console.error("usage: node smithue-exec.mjs <command> [params.json | - | '{json}']");
    process.exit(1);
  }
  let raw = '{}';
  if (paramsArg === '-') {
    raw = fs.readFileSync(0, 'utf8'); // stdin as UTF-8
  } else if (paramsArg && /^\s*[[{]/.test(paramsArg)) {
    raw = paramsArg; // inline JSON
  } else if (paramsArg) {
    raw = fs.readFileSync(paramsArg, 'utf8'); // file, explicit UTF-8
  }
  raw = raw.replace(/^\uFEFF/, ''); // strip BOM
  let params;
  try {
    params = raw.trim() ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('invalid JSON params:', e.message);
    process.exit(1);
  }
  try {
    const inst = discover();
    const ready = await fetch(`http://127.0.0.1:${inst.port}/ready`, { signal: AbortSignal.timeout(10000) });
    const identity = await ready.json();
    if (!Number.isInteger(identity.pid) || identity.pid <= 0 || !identity.instance_id) {
      throw new Error('Target lacks verifiable instance identity. Update its plugin.');
    }
    if (!identity.ready) throw new Error('Target editor is not ready.');
    if (inst.pid !== undefined && identity.pid !== undefined && inst.pid !== identity.pid) {
      throw new Error('Target editor identity mismatch; refusing to execute.');
    }
    if (inst.instance_id && inst.instance_id !== identity.instance_id) {
      throw new Error('Target editor instance changed; explicitly rebind.');
    }
    const out = await post(inst.port, command, params, identity);
    process.stdout.write(out);
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
}

main();
