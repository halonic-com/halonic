# shell.place-signal-changes

- Status: active
- Since: 0.1.0
- Source: HAL-5189, from the review of HAL-5187; component specs 24.4 S2 (HAL-175)

The shell shall let a feature that adds a place also give `subscribeSignal`, which tells the shell when the place's signal may have changed. While the sidebar shows, the shell shall listen to each place that gives it, through the context of the feature that added the place, and shall read that place's signal again each time it is told, without waiting for the tabs to change. When the sidebar goes away, the shell shall stop listening.

## Examples

- Given _inbox_ adds the Inbox with a count of 2 waiting and `subscribeSignal`,
  when a third item arrives and the Inbox says its signal changed,
  then the sidebar shows 3 and a screen reader hears "Inbox, 3 waiting", with no change to the tabs.
- Given the Inbox shows a count of 1,
  when its count drops to 0 and it says so,
  then the sidebar shows no count and a screen reader hears only "Inbox".
- Given the sidebar listens to the Inbox's signal,
  when the sidebar goes away,
  then it no longer listens.
