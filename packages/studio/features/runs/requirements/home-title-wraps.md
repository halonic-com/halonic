# runs.home-title-wraps

- Status: active
- Since: unreleased
- Source: HAL-13305 (C163 H2b)

The Recent runs card on Home shall wrap a row's title, "Support reply · run 2ff090", onto a second line when it doesn't fit, at any width, so the run's short id always shows whole; the row's second line shall stay cut with an ellipsis and its status chip shall stay at the right.

## Examples

- Given a run of Support reply that needs you, shown on a 320px wide phone,
  when Home shows Recent runs,
  then its row shows the whole title "Support reply · run 2ff090" and the row doesn't scroll sideways.
