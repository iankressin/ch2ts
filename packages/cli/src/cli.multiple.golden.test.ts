import { describe, expect, it } from 'vitest';
import { runCli } from './index';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const multiSqlPath = resolve(process.cwd(), 'testdata/simple/test.sql');
const goldenMultiZodPath = resolve(process.cwd(), 'testdata/golden/simple.multiple.zod.ts');

describe('CLI multiple statements (tables + MVs)', () => {
  it('file input with table + MV → --out --emit-zod', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ch2ts-'));
    try {
      const outPath = join(dir, 'types.ts');
      await runCli([multiSqlPath, '--out', outPath, '--camel', '--emit-zod']);
      const got = readFileSync(outPath, 'utf8').trim();
      const golden = readFileSync(goldenMultiZodPath, 'utf8').trim();
      expect(got).toBe(golden);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

