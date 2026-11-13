CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE users (
  id            serial PRIMARY KEY,
  nombre        text NOT NULL,
  apellido      text NOT NULL,
  edad          int,
  telefono      text,
  compania      text,
  estado        text,
  colonia       text,
  correo        text NOT NULL,
  password_hash text NOT NULL,
  rol           text NOT NULL CHECK (rol IN ('admin','cliente')),
  is_root       boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX users_correo_key ON users (lower(correo));

CREATE TABLE nodes (
  node_key   text PRIMARY KEY,
  region     text NOT NULL,
  zone       text NOT NULL,
  device_id  text NOT NULL,
  kind       text NOT NULL DEFAULT 'node' CHECK (kind IN ('node','gateway')),
  via        text,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen  timestamptz,
  UNIQUE (region, zone, device_id)
);

CREATE TABLE readings (
  time       timestamptz NOT NULL,
  node_key   text        NOT NULL,
  grp        text        NOT NULL CHECK (grp IN ('metrics','sensors_health','diagnostics')),
  metric     text        NOT NULL,
  value      double precision,
  value_text text
);

SELECT create_hypertable('readings', 'time', chunk_time_interval => INTERVAL '1 day');

CREATE INDEX readings_node_metric_time ON readings (node_key, metric, time DESC);

ALTER TABLE readings SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'node_key, metric',
  timescaledb.compress_orderby   = 'time DESC'
);

SELECT add_compression_policy('readings', INTERVAL '7 days');

SELECT add_retention_policy('readings', INTERVAL '180 days');

CREATE TABLE thresholds (
  node_key  text NOT NULL DEFAULT '*',
  metric    text NOT NULL,
  min_value double precision,
  max_value double precision,
  severity  text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  PRIMARY KEY (node_key, metric)
);

INSERT INTO thresholds (node_key, metric, min_value, max_value, severity) VALUES
  ('*', 'ph',               6.5, 8.5,  'warning'),
  ('*', 'turbidity_ntu',    NULL, 5,   'warning'),
  ('*', 'conductivity_tds', NULL, 1000,'warning'),
  ('*', 'water_temp_c',     5,   35,   'info'),
  ('*', 'gas_ppm_co2eq',    NULL, 1000,'warning');

CREATE TABLE alerts (
  id        bigserial PRIMARY KEY,
  node_key  text NOT NULL,
  rule      text NOT NULL,
  metric    text,
  severity  text NOT NULL CHECK (severity IN ('info','warning','critical')),
  message   text NOT NULL,
  value     double precision,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  ack_by    int REFERENCES users(id) ON DELETE SET NULL,
  ack_at    timestamptz
);

CREATE UNIQUE INDEX alerts_one_open ON alerts (node_key, rule, COALESCE(metric, '')) WHERE closed_at IS NULL;

CREATE INDEX alerts_node_time ON alerts (node_key, opened_at DESC);

CREATE TABLE command_log (
  id           bigserial PRIMARY KEY,
  node_key     text NOT NULL,
  command      text NOT NULL,
  value        text NOT NULL,
  user_id      int REFERENCES users(id) ON DELETE SET NULL,
  sent_at      timestamptz NOT NULL DEFAULT now(),
  status       text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','confirmed','timeout','failed')),
  confirmed_at timestamptz
);

CREATE TABLE reports (
  id          serial PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_id     int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_key    text,                                  -- nodo afectado
  sensor      text NOT NULL,
  description text NOT NULL,
  status      text NOT NULL DEFAULT 'Pendiente' CHECK (status IN ('Pendiente','Revisado')),
  resolved_at timestamptz
);