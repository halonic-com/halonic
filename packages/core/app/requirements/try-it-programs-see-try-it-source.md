# app.try-it-programs-see-try-it-source

- Status: active
- Since: 0.1.0
- Source: the security condition from the review of halonic#1499 (HAL-4728), on HAL-3246; stub `engine.try-it-programs-see-try-it-source` in req-core-engine (option 2 of the two offered, decided on HAL-3246)

While Try it or Test holds back a file that isn't an item, such as a script a connector runs, when it asks the review service for its source for one workflow or agent, the service shall list as can't-try (`needs-left-out-change`, naming the first such file and its reason) every step that would start a program reading the workspace from disk: a stdio connector that the workspace's trust record doesn't pin, or an agent in a harness program other than Halonic's own loop, whose working folder is always inside the workspace. For an agent being tried, the whole item can't be tried. Pinned connectors, which run in their own folder, and steps that start no program are not affected. A caller that passes no pins gets every connector treated as unpinned.

## Examples

- Given connector `sync` (stdio, not pinned, `cwd: tools`), given to agent `writer`, and an assistant change to `tools/run.sh` the person hasn't accepted,
  when Try it asks for its source for workflow `triage`, whose step `reply` runs `writer`,
  then step `reply` can't be tried and its reason names `tools/run.sh`, while Try it's own source still reads the accepted script.
- Given the same change and `sync` pinned in the trust record, then every step can be tried.
- Given agent `sorter` with `harness: claude-code` and a held-back `.tools/run.sh`, then every step that runs `sorter` can't be tried, and `sorter` tried on its own can't be tried as a whole.
- Given an agent with `harness: halonic`, then it starts no program and its step can be tried.
- Given no held-back file that isn't an item, then unpinned stdio connectors and harness agents are tried as before.
