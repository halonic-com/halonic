-- Every forecast point seats.forecast makes (HAL-16692): the used % of one window
-- 1, 5 and 24 hours ahead, which seats.accuracy later scores against the
-- readings (src/seats/forecast/accuracy.ts). Only adds, as Paperclip wants.

CREATE TABLE plugin_seats_2a33967373.forecast_point (
  made_at timestamptz NOT NULL,
  seat_id text NOT NULL,
  window_key text NOT NULL,
  horizon_minutes integer NOT NULL,
  target_at timestamptz NOT NULL,
  p50 double precision NOT NULL,
  p90 double precision NOT NULL,
  PRIMARY KEY (made_at, seat_id, window_key, horizon_minutes)
);

-- seats.accuracy loads the points of one day by their target time.
CREATE INDEX forecast_point_target_at ON plugin_seats_2a33967373.forecast_point (target_at);
