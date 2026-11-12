# Decision: a plugin's backend starts only when its folder is what was trusted

- Approval: a change to an active requirement needs Liam's review (requirement guard); Liam approves this note in review of the loader pull request on HAL-7896
- Kind: internal
- Task: HAL-7896

## What changes

- `loadPluginBackend` takes the files the trust check hashed. Before every runner start,
  including the restart after an idle stop, it checks that the plugin's folder holds exactly
  those files with those hashes. A difference refuses the start and names paths only
  (added, missing or changed), never contents.
- The check refuses any entry that is not a directory or a plain file, so a link or special
  file added after the trust check is refused.
- `plugin: true` is no longer an option of the exported `LoadLocalIntegrationOptions`. Only
  `loadPluginBackend` can load a local integration as a plugin's backend.
- The requirement `integration-runner.plugin-backend` states both rules.

## Why

The trust check hashed the folder and then dropped the result, so a change to the folder
between the check and the start ran code the person had not trusted. A hash check before each
start closes that, and it covers the idle restart, which was the longest gap.

Copying the checked files into a private folder would also close the few milliseconds between
the check and Node reading a file. It is a larger change, so it is left as a possible
follow-up.

## Covers

- integration-runner.plugin-backend
