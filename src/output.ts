import fs from 'node:fs';
import { SmithUEError } from './portfile.js';

export interface OutputOptions {
  terse?: boolean;
  outPath?: string;
}

let _opts: OutputOptions = {};

export function escapeNonAscii(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x80) {
      out += s[i];
    } else {
      out += `\\u${code.toString(16).padStart(4, '0')}`;
    }
  }
  return out;
}

export function setOutputOptions(opts: OutputOptions): void {
  _opts = { ..._opts, ...opts };
}

export function printResult(data: unknown): void {
  const json = _opts.terse
    ? JSON.stringify(data) + '\n'
    : JSON.stringify(data, null, 2) + '\n';

  if (_opts.outPath) {
    let isDir = false;
    try {
      isDir = fs.statSync(_opts.outPath).isDirectory();
    } catch {
      // path doesn't exist — fine, writeFileSync will create it
    }

    if (isDir) {
      process.stderr.write(
        escapeNonAscii(JSON.stringify({ error: `outPath is a directory: ${_opts.outPath}`, exit_code: 1 })) +
          '\n',
      );
      process.exit(1);
      return;
    }

    fs.writeFileSync(_opts.outPath, json, 'utf8');
    return;
  }

  process.stdout.write(escapeNonAscii(json));
}

export function printError(err: unknown): void {
  let message: string;
  let exitCode: number;

  if (err instanceof SmithUEError) {
    message = err.message;
    exitCode = err.exitCode;
  } else if (err instanceof Error) {
    message = err.message;
    exitCode = 4;
  } else {
    message = String(err);
    exitCode = 4;
  }

  // Extract curl fallback from message if present (written as "  Fallback: curl ...")
  const fallbackMatch = message.match(/\n\s+Fallback:\s+(curl\s+.+)/);
  const fallback_cmd = fallbackMatch ? fallbackMatch[1]!.trim() : undefined;
  const cleanMessage = message.split('\n')[0]!; // first line for code-parseable summary

  // Machine-readable error envelope (P3.3)
  const envelope = {
    ok: false,
    error: {
      message: cleanMessage,
      full_message: message,
      code: exitCode,
      exit: exitCode,
      ...(fallback_cmd ? { hint: 'Use fallback_cmd to verify connectivity.', fallback_cmd } : {}),
    },
  };

  process.stderr.write(escapeNonAscii(JSON.stringify(envelope)) + '\n');
  process.exit(exitCode);
}
