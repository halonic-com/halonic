# library.knowledge-page

- Status: active
- Since: unreleased
- Source: HAL-1303 (T10, P6b); flow-library 5.2; `library.knowledge.lookup-mode`, `library.knowledge.summarize-on-request` (remove step) (HAL-119)

When a knowledge source opens, its page shall show where its documents are ("Source"), its summary or "No summary yet." with **Remove summary** when there is one, "How agents look things up" as two options ("Agents search when they decide to (tools)" and "Also search with the task before the first model call (auto)"), and "Used by" with the agents that use it, or "No agent uses this source yet." when none does. When an option is picked, the page shall save it at once through the knowledge host as one change, writing `mode: auto` for the second and removing `mode` for the first. **Remove summary** shall remove `summary` from the file. If a save fails, then the page shall keep the draft and say so through the window's save state (the status bar's "Couldn't save · Try again" and the toast "Couldn't save *name*: *reason*." with **Try again**, microcopy 2), with no box of its own on the page. The page has no name field. If the host has no such source, then the page shall say "This knowledge source isn't in this workspace any more." with **Go to Library**.

## Examples

- Given a source with no `mode`, when its page opens, then "Agents search when they decide to (tools)" is picked.
- Given that source, when the second option is picked, then the host writes the file once, with `mode: auto`.
- Given `mode: auto`, when the first option is picked, then the host writes the file without `mode`.
- Given a source with a summary, when **Remove summary** is clicked, then the host writes the file without `summary` and the page says "No summary yet."
- Given a writable source, then the page shows no note under Source, as agents can't write to knowledge yet.
- Given a source nobody uses, then "Used by" says "No agent uses this source yet."
- Given a source the host doesn't have, then the page says "This knowledge source isn't in this workspace any more."
- Given a save that fails, when an option is picked, then the window's save state says it couldn't save, with **Try again**; the page has no box.
- Given that failure, when **Try again** is run and the save works, then the host writes the file.
- Given a draft summary whose save failed, when **Try again** is run and the save works, then the draft box closes.
