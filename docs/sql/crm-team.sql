CREATE TABLE IF NOT EXISTS crm_team_members (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  role text NOT NULL CHECK (role IN ('co-owner', 'manager')),
  enabled boolean NOT NULL DEFAULT true,
  access_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_sign_in_at timestamptz
);

CREATE TABLE IF NOT EXISTS crm_team_login_links (
  token_hash text PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES crm_team_members (id) ON DELETE CASCADE,
  access_version integer NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS crm_team_sessions (
  token_hash text PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES crm_team_members (id) ON DELETE CASCADE,
  access_version integer NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS crm_team_rate_limits (
  key_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL,
  PRIMARY KEY (key_hash, window_start)
);

CREATE INDEX IF NOT EXISTS crm_team_links_expires_idx ON crm_team_login_links (expires_at);
CREATE INDEX IF NOT EXISTS crm_team_sessions_expires_idx ON crm_team_sessions (expires_at);
CREATE INDEX IF NOT EXISTS crm_team_rate_windows_idx ON crm_team_rate_limits (window_start);
