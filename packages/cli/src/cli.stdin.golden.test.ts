import { describe, expect, it, vi } from 'vitest';
import { runCli } from './index';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';

const simpleSqlPath = resolve(process.cwd(), 'testdata/simple/create_simple.sql');
const goldenDefaultPath = resolve(process.cwd(), 'testdata/golden/simple.default.ts');

describe('CLI stdin golden', () => {
  it('stdin → stdout matches golden', async () => {
    const sql = readFileSync(simpleSqlPath, 'utf8');
    const stdin = Readable.from(sql);
    let output = '';
    const spy = vi.spyOn(console, 'log').mockImplementation((s?: unknown) => { output += String(s); });
    await runCli(['--camel'], stdin);
    const golden = readFileSync(goldenDefaultPath, 'utf8').trim();
    expect(output.trim()).toBe(golden);
    spy.mockRestore();
  });
});
