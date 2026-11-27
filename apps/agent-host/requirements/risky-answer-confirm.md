# agent-host.risky-answer-confirm

- Status: active
- Since: unreleased
- Source: architecture note HAL-17491, section 6.8 condition 2 (revision 17), decided on HAL-20274; plan on HAL-20278, approved by Liam, with Julian's additions; task HAL-20441; declining options, the note, the fresh read and unoffered options from the review on HAL-20469

When Studio sends `POST /v1/messaging/answer`, the agent host shall read the item again from the workspace's `AgentMessaging`, whichever engine serves the workspace (this computer's provider or a paired server), and shall refuse an item it no longer lists with the result `refused`, reason `not-found`, sending nothing. When the item's risk is anything but `normal` and the answer isn't an option the item offers with `declines` set, whatever the option's ID, the host shall send nothing and answer 409 `needs_confirmation` with `confirmation`: the item's first line as its title, who asks, the label of the option picked, the note sent with it under the option's `noteLabel`, the item's `reach`, and the SHA-256 digest of the whole item and the answer in a fixed key order, each line without format characters and cut between code points. When such an answer picks an option the item doesn't offer, the host shall refuse it with the result `refused`, reason `bad-answer`, before asking. When the local copy holds the item as anything but `normal`, and on every confirmed send, the host shall read the sources again before it reads the item. When Studio's shell sends `POST /v1/messaging/answer-confirmed` with the item, the answer and a digest, the host shall send the answer only when the item and the answer still give that digest, and otherwise answer 409 `item_changed` and send nothing. The paired server keeps its own copy, which it reads again on its own schedule; a follow-up makes it read Paperclip at the confirmed send. The phone's path keeps its own owner check.

## Examples

- Given a pending `hire_agent` approval on this computer's Paperclip,
  when Studio sends Approve on `POST /v1/messaging/answer`,
  then the host answers 409 `needs_confirmation` with the hire's agent, adapter and variables, and Paperclip hears nothing.
- Given the same approval on a paired server,
  when Studio sends Approve on `POST /v1/messaging/answer`,
  then the host answers 409 `needs_confirmation`, and the server hears no answer.
- Given that approval,
  when Studio sends Reject,
  then the host sends it at once.
- Given the digest the host gave for that approval,
  when the agent changes the hire's variables and the shell then sends `answer-confirmed` with that digest,
  then the host answers 409 `item_changed` and sends nothing.
- Given a risky decision whose destructive option the agent named `reject`,
  when Studio sends that option,
  then the host answers 409 `needs_confirmation` and sends nothing.
- Given a budget override,
  when Studio sends Approve with the note "21474836.47",
  then the confirmation shows "21474836.47" under "New limit, in dollars".
- Given a secret proposal the host's local copy holds,
  when the agent changes it in Paperclip and, before any poll, the shell sends `answer-confirmed` with the earlier digest,
  then the host answers 409 `item_changed` and sends nothing.
