import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { printResult, printError, setOutputOptions } from '../../src/output';
import { SmithUEError } from '../../src/portfile';
import fs from 'node:fs';

describe('printResult', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    // Reset options before each test
    setOutputOptions({ terse: false, outPath: undefined });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes pretty JSON to stdout', () => {
    const data = { foo: 'bar', num: 42 };
    printResult(data);
    expect(stdoutSpy).toHaveBeenCalledOnce();
    expect(stdoutSpy).toHaveBeenCalledWith(JSON.stringify(data, null, 2) + '\n');
  });

  it('does not call process.exit', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    printResult({ ok: true });
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('terse=true writes minified JSON to stdout', () => {
    setOutputOptions({ terse: true });
    const data = { status: 'ok', count: 3 };
    printResult(data);
    expect(stdoutSpy).toHaveBeenCalledOnce();
    expect(stdoutSpy).toHaveBeenCalledWith(JSON.stringify(data) + '\n');
  });

  it('outPath set → writes to file, stdout is silent', () => {
    const outPath = 'C:/Users/dingxiao/AppData/Local/Temp/opencode/test-out.json';
    const writeFileSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    const statSyncSpy = vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);

    setOutputOptions({ outPath });
    const data = { hello: 'world' };
    printResult(data);

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(writeFileSpy).toHaveBeenCalledWith(outPath, JSON.stringify(data, null, 2) + '\n', 'utf8');

    writeFileSpy.mockRestore();
    statSyncSpy.mockRestore();
  });

  it('terse=true + outPath → writes minified JSON to file, stdout silent', () => {
    const outPath = 'C:/Users/dingxiao/AppData/Local/Temp/opencode/test-terse.json';
    const writeFileSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    const statSyncSpy = vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);

    setOutputOptions({ terse: true, outPath });
    const data = { status: 'ok', count: 3 };
    printResult(data);

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(writeFileSpy).toHaveBeenCalledWith(outPath, JSON.stringify(data) + '\n', 'utf8');

    writeFileSpy.mockRestore();
    statSyncSpy.mockRestore();
  });

  it('outPath pointing to directory → writes error to stderr and exits non-zero', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const statSyncSpy = vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as fs.Stats);

    setOutputOptions({ outPath: '/some/dir' });
    printResult({ data: 1 });

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
    statSyncSpy.mockRestore();
  });
});

describe('printError', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles SmithUEError with correct exitCode', () => {
    const err = new SmithUEError('unreachable port', 2);
    printError(err);
    expect(stderrSpy).toHaveBeenCalledWith(
      JSON.stringify({ error: 'unreachable port', exit_code: 2 }) + '\n',
    );
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('handles plain Error with exitCode 4', () => {
    const err = new Error('something went wrong');
    printError(err);
    expect(stderrSpy).toHaveBeenCalledWith(
      JSON.stringify({ error: 'something went wrong', exit_code: 4 }) + '\n',
    );
    expect(exitSpy).toHaveBeenCalledWith(4);
  });

  it('handles string error with exitCode 4', () => {
    printError('just a string');
    expect(stderrSpy).toHaveBeenCalledWith(
      JSON.stringify({ error: 'just a string', exit_code: 4 }) + '\n',
    );
    expect(exitSpy).toHaveBeenCalledWith(4);
  });

  it('does not write to stdout for errors', () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    printError(new Error('oops'));
    expect(stdoutSpy).not.toHaveBeenCalled();
  });
});
