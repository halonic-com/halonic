# overview.daily-recap

- Status: draft
- Since: unreleased
- Source: HAL-17422 plan (feature 4), approved by the board on HAL-10 (24 Nov); ADR `docs/adr/2026-11-24-agent-messaging.md`; task HAL-17446. Draft until track B lands; it then becomes active.

When the person opens the recap, the overview shall show, from `AgentMessaging` reads only, how many inbox items were answered, every inbox item still open with how long it has waited, the work done and the work newly blocked since the last recap the person opened. When nothing was answered, done or blocked since then and no item is open, the recap shall say that nothing changed. The recap shall draw questions and titles as plain text only.

## Examples

- Given one item answered and one work item blocked since the last recap, and two items open for 2 days and 3 hours,
  when the person opens the recap,
  then it shows 1 item answered, the two open items waiting 2 days and 3 hours, and the blocked work.
- Given nothing changed since the last recap and no open item,
  when the person opens the recap,
  then it says nothing changed since the last recap.
