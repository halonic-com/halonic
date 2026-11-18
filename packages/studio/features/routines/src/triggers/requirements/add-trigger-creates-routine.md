# routines.triggers.add-trigger-creates-routine

- Status: draft
- Since: unreleased
- Source: HAL-1306 (T12 PR 15); flow-routines 2.3

When the person presses Add trigger, the Triggers section shall ask the host to make a manual routine that starts the owner and open its page, and when the host can't, the section shall say why and keep its rows.

## Examples

- Given the host makes the routine daily-2, then its page opens. Given the host rejects, then the section says "Couldn't add a trigger." and the reason.
