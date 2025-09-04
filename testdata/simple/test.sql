CREATE TABLE IF NOT EXISTS solana_swaps_raw
(
    timestamp                    DateTime CODEC (DoubleDelta, ZSTD),
    dex                          LowCardinality(String),
    token_a                      String,
    token_b                      String,
    amount_a                     Float64,
    amount_b                     Float64,
    token_a_usdc_price           Float64,
    token_b_usdc_price           Float64,
    token_a_balance              Float64,
    token_a_acquisition_cost_usd Float64,
    token_b_balance              Float64,
    token_b_acquisition_cost_usd Float64,
    token_a_profit_usdc          Float64,
    token_b_profit_usdc          Float64,
    token_a_cost_usdc            Float64,
    token_b_cost_usdc            Float64,
    account                      String,
    block_number                 UInt32 CODEC (DoubleDelta, ZSTD),
    transaction_index            UInt16,
    instruction_address          Array (UInt16),
    transaction_hash             String,
    slippage                     Float64,
    pool_token_a_reserve         Float64,
    pool_token_b_reserve         Float64,
    pool_tvl                     Float64 MATERIALIZED abs(pool_token_a_reserve * token_a_usdc_price) + abs(pool_token_b_reserve * token_b_usdc_price),
    sign                         Int8,
    pool_address                 String,
    INDEX idx_account_timestamp (timestamp, account) TYPE minmax GRANULARITY 1,
    INDEX idx_account (account) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX pool_idx pool_address TYPE bloom_filter GRANULARITY 1,
    INDEX amount_a_idx amount_a T
) ENGINE = CollapsingMergeTree(sign)
      PARTITION BY toYYYYMM(timestamp)
      ORDER BY (block_number, transaction_index, instruction_address);

CREATE MATERIALIZED VIEW IF NOT EXISTS wallet_performance_daily
    ENGINE = AggregatingMergeTree()
    ORDER BY (timestamp, account)
    POPULATE
AS
SELECT toStartOfDay(timestamp) AS timestamp,
       account,
       anyLastState(ssr.timestamp) as last_activity,
       sumState(token_a_profit_usdc + token_b_profit_usdc) as profit_usdc,
       sumState(abs(amount_a * token_a_usdc_price) + abs(amount_b * token_b_usdc_price)) as volume_usdc,
       countState(amount_a > 0 AND amount_b > 0) as transaction_count
FROM solana_swaps_raw ssr
WHERE amount_a != 0
  AND amount_b != 0
  AND sign > 0
GROUP BY timestamp, account;

