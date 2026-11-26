-- Apply once to a dedicated PostgreSQL database. This schema contains only
-- fields explicitly published to customers; it is independent of local CRM data.
CREATE TABLE IF NOT EXISTS portal_customers (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  access_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS portal_jobs (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES portal_customers(id),
  title text NOT NULL,
  service text NOT NULL,
  status text NOT NULL,
  scheduled_date text NOT NULL DEFAULT '',
  scheduled_time text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_jobs_customer_idx ON portal_jobs (customer_id, created_at DESC);
CREATE TABLE IF NOT EXISTS portal_login_links (
  token_hash text PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES portal_customers(id),
  access_version integer NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE TABLE IF NOT EXISTS portal_sessions (
  token_hash text PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES portal_customers(id),
  access_version integer NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS portal_sessions_customer_idx ON portal_sessions (customer_id);
CREATE TABLE IF NOT EXISTS portal_rate_limits (
  key_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key_hash, window_start)
);
CREATE INDEX IF NOT EXISTS portal_login_links_expiry_idx ON portal_login_links (expires_at);
CREATE INDEX IF NOT EXISTS portal_sessions_expiry_idx ON portal_sessions (expires_at);
CREATE INDEX IF NOT EXISTS portal_rate_limits_window_idx ON portal_rate_limits (window_start);
-- Schedule maintenance using the database provider's job scheduler:
-- DELETE FROM portal_login_links WHERE expires_at < now() - interval '1 day';
-- DELETE FROM portal_sessions WHERE expires_at < now() - interval '1 day';
-- DELETE FROM portal_rate_limits WHERE window_start < now() - interval '2 days';

