-- The nightly fits of the seat forecast (HAL-16692), one row per day, plan,
-- model and window: how many points of a window a million tokens of each
-- type cost (src/seats/forecast/calibrate.ts). Only adds, as Paperclip wants.

CREATE TABLE plugin_seats_2a33967373.calibration (
  day date NOT NULL,
  plan text NOT NULL,
  model text NOT NULL,
  window_key text NOT NULL,
  from_at timestamptz NOT NULL,
  to_at timestamptz NOT NULL,
  input_points_per_million double precision NOT NULL,
  cached_points_per_million double precision NOT NULL,
  output_points_per_million double precision NOT NULL,
  steps integer NOT NULL,
  median_error_points double precision NOT NULL,
  p90_error_points double precision NOT NULL,
  week_shift double precision,
  shifted boolean NOT NULL,
  PRIMARY KEY (day, plan, model, window_key)
);
