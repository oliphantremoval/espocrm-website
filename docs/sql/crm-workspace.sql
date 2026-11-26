-- Run after the database connection has been verified.
-- The primary owner initializes the workspace explicitly from the CRM.
CREATE TABLE IF NOT EXISTS crm_workspace (
  id smallint PRIMARY KEY CHECK (id = 1),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
