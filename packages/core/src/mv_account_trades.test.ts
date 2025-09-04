import { describe, it, expect } from "vitest";
import { generateSource } from "./index.js";

const map = {
  int64As: "bigint" as const,
  decimal: "string" as const,
  datetimeAs: "string" as const,
  camelCase: true,
};

describe("MV with WITH CTE and aggregates (solana_account_trades_daily)", () => {
  it("infers final SELECT columns and aggregate types", () => {
    const sql = `
CREATE MATERIALIZED VIEW IF NOT EXISTS solana_account_trades_daily ENGINE AggregatingMergeTree() ORDER BY (timestamp, account, token)
AS
WITH trades AS (
  SELECT timestamp, transaction_index, instruction_address, token_a as token, account,
         amount_a AS amount, amount_a * token_a_usdc_price AS amount_usdc,
         toFloat64(token_a_balance) AS balance,
         toFloat64(token_a_acquisition_cost_usd) AS acquisition_cost_usd,
         toFloat64(token_a_profit_usdc) AS profit_usdc,
         toFloat64(token_a_cost_usdc) AS cost_usdc
  FROM solana_swaps_raw
)
SELECT
    toStartOfDay(timestamp) as timestamp,
    token,
    account,
    countIfState(amount > 0) as buy_count,
    countIfState(amount < 0) as sell_count,
    sumStateIf(abs(amount), amount > 0) as buy_amount,
    sumStateIf(abs(amount), amount < 0) as sell_amount,
    sumStateIf(abs(amount_usdc), amount > 0) as buy_amount_usdc,
    sumStateIf(abs(amount_usdc), amount < 0) as sell_amount_usdc,
    sumState(profit_usdc) as profit_usdc,
    sumState(cost_usdc) as cost_usdc,
    anyLastState(balance) as balance,
    maxState(acquisition_cost_usd) as acquisition_cost_usd
FROM trades
GROUP BY timestamp, account, token;
`;
    const out = generateSource(sql, map, { emitZod: false });
    expect(out).toMatch(/export interface SolanaAccountTradesDaily/);
    // Core fields
    expect(out).toMatch(/timestamp: string/);
    expect(out).toMatch(/token: string/);
    expect(out).toMatch(/account: string/);
    // Aggregates should map to number
    expect(out).toMatch(/buyCount: number/);
    expect(out).toMatch(/sellCount: number/);
    expect(out).toMatch(/buyAmount: number/);
    expect(out).toMatch(/sellAmount: number/);
    expect(out).toMatch(/buyAmountUsdc: number/);
    expect(out).toMatch(/sellAmountUsdc: number/);
    expect(out).toMatch(/profitUsdc: number/);
    expect(out).toMatch(/costUsdc: number/);
    expect(out).toMatch(/balance: number/);
    expect(out).toMatch(/acquisitionCostUsd: number/);
  });
});
