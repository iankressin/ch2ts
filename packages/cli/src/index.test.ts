import { describe, expect, it } from 'vitest';
import { buildCli } from './index';

describe('@ch2ts/cli wiring', () => {
  it('parses basic flags', () => {
    const program = buildCli();
    program.parse(['input.sql', '--out', 'types.ts', '--camel'], { from: 'user' });
    const opts = program.opts<{ out?: string; camel: boolean }>();
    expect(opts.out).toBe('types.ts');
    expect(opts.camel).toBe(true);
    expect(program.args[0]).toBe('input.sql');
  });
});
