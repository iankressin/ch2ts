import { describe, expect, it } from 'vitest';
import { generateSource } from './index.js';

const map = {
  int64As: 'bigint' as const,
  decimal: 'string' as const,
  datetimeAs: 'string' as const,
  camelCase: true
};

describe('Materialized View handling', () => {
  it('ignores routing materialized views (TO/FOR)', () => {
    const sql = `
      CREATE TABLE base (id UInt64, name String) ENGINE = MergeTree ORDER BY id;
      CREATE MATERIALIZED VIEW mv_to TO base AS SELECT id, name FROM base;
    `;
    const out = generateSource(sql, map, { emitZod: false });
    expect(out).toContain('export interface Base');
    expect(out).not.toContain('export interface MvTo');
  });

  it('emits MV that stores data (no FOR/TO) and derives types from source table', () => {
    const sql = `
      CREATE TABLE base (id UInt64, name String, ts DateTime) ENGINE = MergeTree ORDER BY id;
      CREATE MATERIALIZED VIEW mv AS SELECT id, name as label, ts FROM base;
    `;
    const out = generateSource(sql, map, { emitZod: false });
    expect(out).toContain('export interface Base');
    expect(out).toContain('export interface Mv');
    // Derived types
    expect(out).toContain('id: bigint');
    expect(out).toContain('label: string');
    expect(out).toContain('ts: string');
  });
});

