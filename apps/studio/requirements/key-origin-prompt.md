# studio.key-origin-prompt

- Status: active
- Since: unreleased
- Source: HAL-11873 (PR 3b, HAL-15128); Liam's plan and pause rules on HAL-11873 (17 Nov); design on HAL-11343

When a model call of the window's own engine is refused because its stored key may not go to the provider's address, Studio shall ask "Allow this address?" (`models.key-address.allow-address`) only for a run a person started at this window: one whose `run.started` has a `manual` or `inbox` trigger or none (a workflow's own Run), and that isn't a subflow. It shall never ask for a chat turn, a routine's schedule, mail, signal or webhook trigger, a run whose log can't be read, a remote engine or a served window; those fail with the refusal as before. The question shall show the key's current addresses, and Allow shall save only the address the engine was refused, through the shell's `secret_allow_origin` (HAL-11887).

## Examples

- Given a run started with Run whose key "gateway-key" may go only to `https://api.example.com`,
  when its provider would send it to `https://gateway.example.com`,
  then the window asks about that address and shows `https://api.example.com` as the key's address.
- Given the same refusal in a run a schedule started, then nobody is asked and the step fails with the refusal.
- Given the person presses Allow, then the shell adds `https://gateway.example.com` to the key's list and nothing else.
