import { describe, expect, it } from 'vitest';
import { runCli } from './index';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const simpleSqlPath = resolve(process.cwd(), 'testdata/simple/create_simple.sql');
const goldenDefaultPath = resolve(process.cwd(), 'testdata/golden/simple.default.ts');
const goldenZodPath = resolve(process.cwd(), 'testdata/golden/simple.zod.ts');
const goldenSchemaPath = resolve(process.cwd(), 'testdata/golden/simple.schema.json');

describe('CLI golden snapshots', () => {
  it('file input → --out default', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ch2ts-'));
    try {
      const outPath = join(dir, 'types.ts');
      await runCli([simpleSqlPath, '--out', outPath, '--camel']);
      const got = readFileSync(outPath, 'utf8').trim();
      const golden = readFileSync(goldenDefaultPath, 'utf8').trim();
      expect(got).toBe(golden);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('file input → --out --emit-zod', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ch2ts-'));
    try {
      const outPath = join(dir, 'types.ts');
      await runCli([simpleSqlPath, '--out', outPath, '--camel', '--emit-zod']);
      const got = readFileSync(outPath, 'utf8').trim();
      const golden = readFileSync(goldenZodPath, 'utf8').trim();
      expect(got).toBe(golden);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('file input → --out --emit-json-schema', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ch2ts-'));
    try {
      const outPath = join(dir, 'types.ts');
      await runCli([simpleSqlPath, '--out', outPath, '--camel', '--emit-json-schema']);
      const schemaPath = outPath.replace(/\.ts$/, '.schema.json');
      const gotSchema = readFileSync(schemaPath, 'utf8').trim();
      const goldenSchema = readFileSync(goldenSchemaPath, 'utf8').trim();
      expect(gotSchema).toBe(goldenSchema);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
