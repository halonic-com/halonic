# studio.workspace-liveness

- Status: draft
- Since: unreleased
- Source: HAL-13206; core's `app.live-state` and `app.routine-versions` (HAL-3246, HAL-3267); flow-routines 3.4–3.7; the "Changes not live yet" line (HAL-13178)

When the desktop app opens a folder, it shall tell the Routines feature whether each routine's saved file is live, with core's `liveState` over the workspace's history: every item is live when the folder keeps no history, never-versioned when it has no version yet or the last version doesn't have the file, live when the saved file is the last version's, and not live since the last version's date otherwise. It shall read the last version's file from `git diff HEAD`, as the Changes page does, and the saved file from the folder. It shall give a routine's page, while the routine has a live version, what that version starts, when and by which rules, and tell the page's listeners when a file is saved or this app makes a new version.

## Examples

- Given a folder that isn't a repository, then a routine is live.
- Given a repository with no version yet, then a routine is never-versioned.
- Given a routine that is unchanged since the version of 10:42, then it is live.
- Given a saved change to its trigger, then it is not live since 10:42, and its page says the live version starts it "Mondays at 09:00" with Analyst.
- Given a new routine file that git doesn't track yet, or one renamed since the last version, then it is never-versioned.
- Given a version is created, then a listener hears it, and not after it stopped.
