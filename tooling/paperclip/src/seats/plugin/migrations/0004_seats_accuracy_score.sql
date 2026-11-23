-- How the forecasts of each day did (HAL-16692): seats.accuracy scores the forecast
-- points whose target fell on one UTC day, per window and horizon
-- (src/seats/forecast/accuracy.ts). Only adds, as Paperclip wants.

CREATE TABLE plugin_seats_2a33967373.accuracy_score (
  day date NOT NULL,
  window_key text NOT NULL,
  horizon_minutes integer NOT NULL,
  samples integer NOT NULL,
  median_error_points double precision NOT NULL,
  p90_error_points double precision NOT NULL,
  inside_band double precision NOT NULL,
  PRIMARY KEY (day, window_key, horizon_minutes)
);
