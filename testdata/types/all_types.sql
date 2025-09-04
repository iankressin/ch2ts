-- Broad coverage of types used in mapping and emitter
CREATE TABLE t_all (
  a Int8,
  b UInt64 COMMENT 'u64',
  c Float64,
  d String,
  e UUID,
  f FixedString(16),
  g Decimal(38,10),
  h Date,
  i DateTime,
  j DateTime64(3),
  k IPv4,
  l IPv6,
  m Nullable(String),
  n LowCardinality(String),
  o Array(UInt32),
  p Tuple(String, UInt32),
  q Map(String, UInt8),
  r Enum8('A'=1,'B'=2)
);

