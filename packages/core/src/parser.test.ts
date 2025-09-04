import { describe, expect, it } from 'vitest';
import { parse } from './index.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('DDL parser (Phase 2)', () => {
  it('parses a simple CREATE TABLE with basic types', () => {
    const sql = readFileSync(resolve(process.cwd(), 'testdata/simple/create_simple.sql'), 'utf8');
    const ast = parse(sql);
    expect(ast).toMatchInlineSnapshot(`
      [
        {
          "columns": [
            {
              "comment": undefined,
              "default": undefined,
              "name": "id",
              "rawType": "UInt64",
              "type": {
                "args": [],
                "name": "UInt64",
              },
            },
            {
              "comment": undefined,
              "default": undefined,
              "name": "name",
              "rawType": "String",
              "type": {
                "args": [],
                "name": "String",
              },
            },
          ],
          "name": "events",
          "orderBy": undefined,
          "partitionBy": undefined,
        },
      ]
    `);
  });

  it('parses nested wrappers and params', () => {
    const sql = `CREATE TABLE db.complicated (
      a Nullable(UInt64) COMMENT 'id',
      b LowCardinality(String),
      c Array(Nullable(Decimal(38,10))),
      d Enum8('A' = 1, 'B' = 2),
      e Tuple(String, UInt32),
      f Map(String, UInt8)
    )`;
    const ast = parse(sql);
    expect(ast[0]?.columns.length).toBe(6);
    expect(JSON.parse(JSON.stringify(ast))).toMatchSnapshot();
  });
});
