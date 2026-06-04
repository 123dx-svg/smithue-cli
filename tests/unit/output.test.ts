import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { printResult, printError } from '../../src/output';
import { SmithUEError } from '../../src/portfile';

describe('printResult', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
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
