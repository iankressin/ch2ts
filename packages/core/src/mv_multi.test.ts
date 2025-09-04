import { describe, expect, it } from 'vitest';
import { generateSource } from './index.js';

const map = {
  int64As: 'bigint' as const,
  decimal: 'string' as const,
  datetimeAs: 'string' as const,
  camelCase: true
};

describe('multiple statements in one file', () => {
  it('emits both base table and storing MV', () => {
    const sql = `
      CREATE TABLE base (id UInt64, name String, ts DateTime) ENGINE = MergeTree ORDER BY id;
      CREATE MATERIALIZED VIEW mv AS SELECT id, name as label, ts FROM base;
    `;
    const out = generateSource(sql, map, { emitZod: false });
    expect(out).toMatch(/export interface Base[\s\S]*id: bigint/);
    expect(out).toMatch(/export interface Mv[\s\S]*label: string/);
  });
});

