# paperclip-client.approval-risk

- Status: active
- Since: unreleased
- Source: board approval of the phase 2 card (HAL-17544, choice ★P2); architecture note HAL-17511, section 2.3 (R3); task HAL-17635

The Paperclip provider shall mark every Paperclip approval in the inbox `risk: "risky"` when approving it spends money or changes who may do what, so that a phone can't answer it unless the desktop allows it: `hire_agent`, `budget_override_required` and `approve_ceo_strategy` (approving the CEO's plan lets it hire and spend on it). An approval of type `request_board_approval`, which only records the board's answer, shall be `normal`. An approval whose type is missing or isn't one of these shall be `risky`, so a type Paperclip adds later, such as one for an agent's permissions, waits for the desktop until it is listed. The risk shall come from Paperclip's approval type only, never from the title or summary the asking agent wrote. Every card (a confirmation, a question or any other kind) shall be `normal`, except a confirmation that asks to run a tool (`payload.toolAction`), which shall be `risky` (HAL-18872).

## Examples

- Given pending approvals of type `hire_agent`, `budget_override_required` and `approve_ceo_strategy`,
  when the inbox is read,
  then each of them is `risky`.
- Given a pending approval of type `request_board_approval`,
  when the inbox is read,
  then it is `normal`.
- Given a pending approval of a type the provider doesn't know, such as `grant_agent_permissions`, or with no type,
  when the inbox is read,
  then it is `risky`.
- Given a `hire_agent` approval whose agent-written title says "Just a typo, nothing risky",
  when the inbox is read,
  then it is still `risky`.
- Given a confirmation card and a question card for the person,
  when the inbox is read,
  then both are `normal`.
- Given a confirmation card that asks to run the tool `send_mail`,
  when the inbox is read,
  then it is `risky`.
