# app.try-it-programs-see-try-it-source

- Status: active
- Since: 0.1.0
- Source: the security condition from the review of halonic#1499 (HAL-4728), on HAL-3246; stub `engine.try-it-programs-see-try-it-source` in req-core-engine (option 2 of the two offered, decided on HAL-3246)

While Try it or Test holds back a file that isn't an item, such as a script a connector runs, when it asks the review service for its source for one workflow or agent, the service shall list as can't-try (`needs-left-out-change`, naming the first such file and its reason) every step that would start a program reading the workspace from disk: a stdio connector that the workspace's trust record doesn't pin, a pinned stdio connector given an argument or environment value that could name a path outside its own folder (an absolute path, a `..` segment or a `file:` URI, any of which could point it at the workspace), or an agent in a harness program other than Halonic's own loop, whose working folder is always inside the workspace. For an agent being tried, the whole item can't be tried. Pinned connectors, which run in their own folder, and steps that start no program are not affected. A caller that passes no pins gets every connector treated as unpinned. Held-back parts of item files (such as an agent's permissions or connectors) are not covered: they are on disk too, but a program only reads them as text, while what a step may do comes from Try it's own source; only a file that isn't an item can be code the program runs.

## Examples

- Given connector `sync` (stdio, not pinned, `cwd: tools`), given to agent `writer`, and an assistant change to `tools/run.sh` the person hasn't accepted,
  when Try it asks for its source for workflow `triage`, whose step `reply` runs `writer`,
  then step `reply` can't be tried and its reason names `tools/run.sh`, while Try it's own source still reads the accepted script.
- Given the same change and `sync` pinned in the trust record, then every step can be tried.
- Given the same change, `sync` pinned, and `sync` given the argument `--root=/srv/acme`, `--root=../../acme`, `file:///srv/acme`, `--roots=docs,/srv/acme`, `docs:/srv/acme` or `--root /srv/acme`, then step `reply` can't be tried.
- Given agent `sorter` with subagent `helper`, whose `harness` is `claude-code`, and a held-back `tools/run.sh`, then `sorter` tried on its own can't be tried as a whole.
- Given a step that runs a child workflow whose step runs `writer`, and the held-back `tools/run.sh`, then that step can't be tried.
- Given only a held-back change to an agent's permissions, then its harness and connectors are tried as before.
- Given agent `sorter` with `harness: claude-code` and a held-back `.tools/run.sh`, then every step that runs `sorter` can't be tried, and `sorter` tried on its own can't be tried as a whole.
- Given an agent with `harness: halonic`, then it starts no program and its step can be tried.
- Given no held-back file that isn't an item, then unpinned stdio connectors and harness agents are tried as before.
