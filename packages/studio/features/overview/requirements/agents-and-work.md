# overview.agents-and-work

- Status: draft
- Since: unreleased
- Source: HAL-17422 plan, approved by the board on HAL-10 (24 Nov); ADR `docs/adr/2026-11-24-agent-messaging.md` (features 10 and 11); task HAL-17445. Draft until track B lands; it then becomes active.

The overview shall list every agent of every `AgentMessaging` source with its source's label, what it is doing and the open work it holds, and shall mark an agent that holds no open work as idle. The overview shall list blocked work with the label and title of each piece of work it waits on. The overview shall tell agents apart by their ID, so two sources' agents with the same name are two entries. When a source says it changed, the overview shall read it again. The overview shall draw names and titles as plain text only.

## Examples

- Given an agent that holds two open pieces of work,
  when the overview is shown,
  then both are listed under that agent.
- Given an agent that holds no open work,
  when the overview is shown,
  then the agent is marked idle.
- Given `ACME-2` blocked by `ACME-1` "Pick a logo",
  when the overview is shown,
  then `ACME-2` is listed as blocked, waiting on `ACME-1` "Pick a logo".
- Given a "Chief" in "Paperclip · Acme" and a "Chief" in "Paperclip · Globex",
  when the overview is shown,
  then there are two Chiefs, each with its own source's label.
