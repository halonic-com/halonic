# Decision: the Library can open New connector with a name and a way already filled in

- Task: HAL-10950 (P8d, HAL-1303)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-10954 (Liam's review of #3144; a team decision with no board card, HAL-2282 rule: it builds on the approved flow-library 3.3 New connector dialog and fills in two of its fields)
- Kind: user-visible
- Signature:

## What changes

The requirement `library.new-connector` gains one paragraph and two examples: when the run banner
asks for a connector it names (`requestNewConnector`), the Library shows the Connectors tab and
opens New connector with the name filled in and, only when the request knows it, the way picked.
A request with no way, or with a way the host does not offer, leaves the way unpicked. A later
request while the dialog is open replaces it. The `Source` line adds P8d.

Nothing existing is removed or weakened. No test is changed, skipped or deleted; tests for the
request, the dropped way and the replaced dialog are added.

## Why

The run banner needs to send a person to New connector for a connector the run asked for, without
retyping the name. The Library guesses nothing, so a wrong way is never picked for them.

## Covers

- library.new-connector
