# workspace.file-places

- Status: active
- Since: 0.1.0
- Source: HAL-1522 (HAL-186 implementation plan, step 1a; plan 4.2)

The workspace package shall find a file's kind, hub and place id from where the file sits, using only the places the registered file kinds declare, so that a new kind with a place is loaded without a change to the loader.

## Examples

- Given `hubs/billing/agents/clerk.agent.yaml`, when `placeOf` reads it, then it is an `agent` in hub `billing` with place id `clerk`.
- Given `hubs/billing/hub.yaml`, when it is read, then it is the `hub` of `billing`, and its place id is `billing`.
- Given `library/skills/plain-words/SKILL.md`, when it is read, then it is a `skill` at the root with place id `plain-words`.
- Given `models.yaml`, when it is read, then it is `models` at the root with no place id.
- Given `README.md` or `hubs/billing/flows/archive.flow.yaml`, when it is read, then no kind places it.
- Given an example path for each place of each registered kind, when it is read, then exactly one kind places it, and it is that kind.
