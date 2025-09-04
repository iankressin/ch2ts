/**
 * Preset configuration for mapping ClickHouse types to TypeScript.
 */

/** Preset options shared across the CLI. */
export interface PresetOptions {
  /** How to represent 64-bit integers. */
  readonly int64As: 'bigint' | 'string';
  /** How to represent Decimals. */
  readonly decimal: 'string' | 'decimal.js';
  /** How to represent Date/DateTime. */
  readonly datetimeAs: 'string' | 'Date';
}

/** Safe preset: strings for lossy/large types. */
export const safePreset: PresetOptions = {
  int64As: 'string',
  decimal: 'string',
  datetimeAs: 'string'
};

/** Strict preset: prefer precise runtime types where possible. */
export const strictPreset: PresetOptions = {
  int64As: 'bigint',
  decimal: 'string',
  datetimeAs: 'Date'
};

/** Decimal.js preset: Decimals map to decimal.js. */
export const decimalJsPreset: PresetOptions = {
  int64As: 'bigint',
  decimal: 'decimal.js',
  datetimeAs: 'string'
};

/** Bigint preset: prefer bigint for 64-bit integers. */
export const bigintPreset: PresetOptions = {
  int64As: 'bigint',
  decimal: 'string',
  datetimeAs: 'string'
};

