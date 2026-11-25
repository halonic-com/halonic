# ports.agent-messaging-option-note

- Status: active
- Since: unreleased
- Source: HAL-18920, follow-up to HAL-18872 (Request changes with a note, a reject that needs a reason); approved by Liam

The `AgentMessaging` port shall let an inbox item's option give the label of a field for a written note, in `noteLabel`, next to `noteRequired`, which says the option is sent only with a note. An option with neither shall be sent as it is. The note shall travel in the option answer's `note`, and an app that has no field for a required note shall leave that option out instead of sending it without one.

## Examples

- Given an approval whose Request changes option has `noteRequired` and the `noteLabel` "What should change?",
  when the inbox items are listed, kept in the cache and sent over the server's routes,
  then the option still has both.
- Given an option with no note,
  when the inbox items are listed,
  then the option has no `noteLabel` and no `noteRequired`.
