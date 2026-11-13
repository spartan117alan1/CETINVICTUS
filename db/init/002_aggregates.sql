CREATE MATERIALIZED VIEW readings_1m WITH (timescaledb.continuous) AS
SELECT time_bucket('1 minute', time) AS bucket, node_key, grp, metric,
       avg(value) AS avg, min(value) AS min, max(value) AS max, count(value) AS n
FROM readings
WHERE value IS NOT NULL
GROUP BY bucket, node_key, grp, metric
WITH NO DATA;

SELECT add_continuous_aggregate_policy('readings_1m',
  start_offset => INTERVAL '2 hours', end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute');

CREATE MATERIALIZED VIEW readings_1h WITH (timescaledb.continuous) AS
SELECT time_bucket('1 hour', time) AS bucket, node_key, grp, metric,
       avg(value) AS avg, min(value) AS min, max(value) AS max, count(value) AS n
FROM readings
WHERE value IS NOT NULL
GROUP BY bucket, node_key, grp, metric
WITH NO DATA;

SELECT add_continuous_aggregate_policy('readings_1h',
  start_offset => INTERVAL '3 days', end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '15 minutes');