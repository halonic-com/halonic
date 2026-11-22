-- The tables of the seats plugin (HAL-16008), as agreed with the seat forecast
-- on HAL-16030 (src/seats/records.ts). Paperclip runs this file unchanged and
-- only allows objects in the schema it gives the plugin, named in full: the
-- schema name comes from the plugin id, see src/seats/plugin/namespace.ts.
-- Paperclip refuses DROP and DELETE in migrations, so later changes only add.
-- No names, e-mails, folders or connection ids: those stay in the settings.
-- No quote marks in these comments: Paperclip strips quoted text before it
-- strips comments, so a stray one would hide the statement from its checks.

CREATE TABLE plugin_seats_2a33967373.seat (
  id text PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('pool', 'reserve', 'paid-api')),
  plan text,
  reset_group text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plugin_seats_2a33967373.reading (
  seat_id text NOT NULL,
  at timestamptz NOT NULL,
  error text CHECK (error IN ('timeout', 'rate-limited', 'signed-out', 'unreadable')),
  session_used_percent smallint,
  session_resets_at timestamptz,
  week_used_percent smallint,
  week_resets_at timestamptz,
  week_by_model jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (seat_id, at)
);

CREATE TABLE plugin_seats_2a33967373.placement (
  agent_id text NOT NULL,
  seat_id text NOT NULL,
  from_at timestamptz NOT NULL,
  to_at timestamptz,
  source text NOT NULL CHECK (source IN ('supervisor', 'board', 'job', 'observed')),
  PRIMARY KEY (agent_id, from_at)
);

CREATE INDEX placement_seat_from ON plugin_seats_2a33967373.placement (seat_id, from_at);

CREATE TABLE plugin_seats_2a33967373.event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seat_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('manual-reset', 'weekly-reset', 'plan-change')),
  at timestamptz NOT NULL,
  by_kind text NOT NULL CHECK (by_kind IN ('board', 'observed')),
  board_user_id text
);

CREATE INDEX event_seat_at ON plugin_seats_2a33967373.event (seat_id, at);

CREATE TABLE plugin_seats_2a33967373.agent_usage (
  agent_id text NOT NULL,
  seat_id text,
  model text NOT NULL,
  bucket_start timestamptz NOT NULL,
  input_tokens bigint NOT NULL,
  cached_input_tokens bigint NOT NULL,
  output_tokens bigint NOT NULL,
  runs integer NOT NULL
);

CREATE UNIQUE INDEX agent_usage_key ON plugin_seats_2a33967373.agent_usage (agent_id, (coalesce(seat_id, '')), model, bucket_start);

CREATE TABLE plugin_seats_2a33967373.agent_activity (
  agent_id text NOT NULL,
  at timestamptz NOT NULL,
  running_runs integer NOT NULL,
  queued_runs integer NOT NULL,
  open_tasks integer NOT NULL,
  run_cap integer,
  model text NOT NULL,
  PRIMARY KEY (agent_id, at)
);
