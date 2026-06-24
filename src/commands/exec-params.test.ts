import { describe, it, expect, vi } from 'vitest';
import { resolveExecParams } from './exec-params.js';
import { SmithUEError } from '../portfile.js';

const neverCalled = vi.fn().mockRejectedValue(new Error('should not be called'));

function makeDeps(overrides?: Partial<{ readStdin: () => Promise<string>; readFile: (p: string) => Promise<string> }>) {
  return {
    readStdin: overrides?.readStdin ?? neverCalled,
    readFile: overrides?.readFile ?? neverCalled,
  };
}

describe('resolveExecParams', () => {
  // (a) positional JSON string → success
  it('(a) positional valid JSON returns parsed object', async () => {
    const result = await resolveExecParams(
      { positional: '{"x":42}' },
      makeDeps(),
    );
    expect(result).toEqual({ x: 42 });
  });

  // (b) stdin:true → reads stdin, returns parsed object
  it('(b) stdin:true reads stdin and returns parsed object', async () => {
    const readStdin = vi.fn().mockResolvedValue('{"hello":"world"}');
    const result = await resolveExecParams(
      { stdin: true },
      makeDeps({ readStdin }),
    );
    expect(result).toEqual({ hello: 'world' });
    expect(readStdin).toHaveBeenCalledOnce();
  });

  // (c) positional '-' → reads stdin, returns parsed object
  it('(c) positional "-" reads stdin and returns parsed object', async () => {
    const readStdin = vi.fn().mockResolvedValue('{"key":"val"}');
    const result = await resolveExecParams(
      { positional: '-' },
      makeDeps({ readStdin }),
    );
    expect(result).toEqual({ key: 'val' });
    expect(readStdin).toHaveBeenCalledOnce();
  });

  // (d) paramsFile → reads file, returns parsed object
  it('(d) paramsFile reads file and returns parsed object', async () => {
    const readFile = vi.fn().mockResolvedValue('{"from":"file"}');
    const result = await resolveExecParams(
      { paramsFile: '/some/path/params.json' },
      makeDeps({ readFile }),
    );
    expect(result).toEqual({ from: 'file' });
    expect(readFile).toHaveBeenCalledWith('/some/path/params.json');
  });

  // (e) --stdin + positional '-' is ONE source (dedup), should succeed
  it('(e) stdin:true + positional "-" is one source and succeeds', async () => {
    const readStdin = vi.fn().mockResolvedValue('{"a":1}');
    const result = await resolveExecParams(
      { positional: '-', stdin: true },
      makeDeps({ readStdin }),
    );
    expect(result).toEqual({ a: 1 });
    expect(readStdin).toHaveBeenCalledOnce();
  });

  // (f) zero source returns {} without calling readStdin
  it('(f) zero source returns {} without calling readStdin', async () => {
    const readStdin = vi.fn();
    const result = await resolveExecParams({}, makeDeps({ readStdin }));
    expect(result).toEqual({});
    expect(readStdin).not.toHaveBeenCalled();
  });

  // (g) positional + stdin:true → error (multiple sources)
  it('(g) positional JSON + stdin:true throws SmithUEError (multiple sources)', async () => {
    let err: unknown;
    try {
      await resolveExecParams(
        { positional: '{"a":1}', stdin: true },
        makeDeps(),
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SmithUEError);
    expect((err as SmithUEError).exitCode).toBe(1);
    expect((err as SmithUEError).message).toMatch(/multiple sources/i);
  });

  // (h) positional + paramsFile → error (multiple sources)
  it('(h) positional JSON + paramsFile throws SmithUEError (multiple sources)', async () => {
    let err: unknown;
    try {
      await resolveExecParams(
        { positional: '{"a":1}', paramsFile: '/some/file.json' },
        makeDeps(),
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SmithUEError);
    expect((err as SmithUEError).exitCode).toBe(1);
    expect((err as SmithUEError).message).toMatch(/multiple sources/i);
  });

  // (i) stdin:true + paramsFile → error (multiple sources)
  it('(i) stdin:true + paramsFile throws SmithUEError (multiple sources)', async () => {
    let err: unknown;
    try {
      await resolveExecParams(
        { stdin: true, paramsFile: '/some/file.json' },
        makeDeps(),
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SmithUEError);
    expect((err as SmithUEError).exitCode).toBe(1);
    expect((err as SmithUEError).message).toMatch(/multiple sources/i);
  });

  // (j) stdin returns empty string → error "was empty"
  it('(j) stdin returns empty string throws SmithUEError (was empty)', async () => {
    const readStdin = vi.fn().mockResolvedValue('   ');
    let err: unknown;
    try {
      await resolveExecParams({ stdin: true }, makeDeps({ readStdin }));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SmithUEError);
    expect((err as SmithUEError).exitCode).toBe(1);
    expect((err as SmithUEError).message).toMatch(/was empty/);
  });

  // (k) stdin returns invalid JSON → error
  it('(k) stdin returns invalid JSON throws SmithUEError', async () => {
    const readStdin = vi.fn().mockResolvedValue('not-json');
    let err: unknown;
    try {
      await resolveExecParams({ stdin: true }, makeDeps({ readStdin }));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SmithUEError);
    expect((err as SmithUEError).exitCode).toBe(1);
    expect((err as SmithUEError).message).toMatch(/valid JSON/);
  });

  // (l) stdin returns JSON array → error (not an object)
  it('(l) stdin returns JSON array throws SmithUEError (must be object)', async () => {
    const readStdin = vi.fn().mockResolvedValue('[1,2,3]');
    let err: unknown;
    try {
      await resolveExecParams({ stdin: true }, makeDeps({ readStdin }));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SmithUEError);
    expect((err as SmithUEError).exitCode).toBe(1);
    expect((err as SmithUEError).message).toMatch(/JSON object/);
  });

  // (m) paramsFile read throws → error wrapping file read error
  it('(m) paramsFile read failure throws SmithUEError with path info', async () => {
    const readFile = vi.fn().mockRejectedValue(new Error('ENOENT: no such file'));
    let err: unknown;
    try {
      await resolveExecParams(
        { paramsFile: '/missing/params.json' },
        makeDeps({ readFile }),
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SmithUEError);
    expect((err as SmithUEError).exitCode).toBe(1);
    expect((err as SmithUEError).message).toMatch(/params-file/);
    expect((err as SmithUEError).message).toMatch(/\/missing\/params\.json/);
    expect((err as SmithUEError).message).toMatch(/ENOENT/);
  });

  // (n) BOM-prefixed JSON from stdin → success (strips BOM)
  it('(n) BOM-prefixed JSON from stdin strips BOM and returns parsed object', async () => {
    const bom = '\uFEFF';
    const readStdin = vi.fn().mockResolvedValue(`${bom}{"bom":true}`);
    const result = await resolveExecParams(
      { stdin: true },
      makeDeps({ readStdin }),
    );
    expect(result).toEqual({ bom: true });
    expect(readStdin).toHaveBeenCalledOnce();
  });
});
