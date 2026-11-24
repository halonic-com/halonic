# paperclip.merge-control-pure

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); HAL-17762

When a merge-control pass runs, the plugin's `decide` shall work out its actions, new state and log only from the snapshot, state, settings and time it is given, loading no module that reads the clock, the network, files or randomness, and leaving the state it was given unchanged.

## Examples

- Given the modules `decide.ts` loads at run time,
  when they are read,
  then all, followed through imports, re-exports and side-effect imports, are relative to the package and none calls `fetch`, `Date.now`, `new Date()`, `Math.random`, `process` or `require`.
- Given the same snapshot, state and time twice,
  when `decide` runs on each,
  then both decisions are equal and the given state is unchanged.
- Given #7 queued at the last pass and merged since,
  when a pass runs,
  then its log says `merged=#7`.
