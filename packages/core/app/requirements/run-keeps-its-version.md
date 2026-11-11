# app.run-keeps-its-version

- Status: active
- Since: 0.1.0
- Source: save model 2.3 (HAL-3246); plan 4.4, runs keep the definitions they started with; stub `engine.run-keeps-its-version` in req-core-engine

While a run that reads the live version is going, the app shall keep reading the commit it started with, and the workspace it loads shall carry that commit as its version; a run that reads the saved files shall carry the saved files' own version.

## Examples

- Given a run of "briefing" started at the live version, when a new version is made, then the run still reads "briefing" as it was at its commit and its workspace's version is that commit.
- Given a Try it run, then its workspace's version is the saved files' version.
