# server.paperclip-sign-in-failures

- Status: active
- Since: unreleased
- Source: Liam's review of #6163 (`server.paperclip-sign-in`). Built in HAL-18769.

When a Paperclip sign-in on the server ends by cancel, by its end time or by a key of another company, and Paperclip fails to cancel its challenge or to revoke its key, the server shall report each failure to its error log with a sentence that says what failed and whether the key may still work, and that holds no key and none of Paperclip's answer.

Rationale: the answer only says `keyMayWork`; the log has to say why, so the owner knows a key is left to revoke in Paperclip.

## Examples

- Given an open sign-in and a Paperclip that refuses the cancel, when the owner cancels it, then the key is revoked and the error log gets "Paperclip didn't cancel an ended sign-in's challenge, so its key is revoked instead."
- Given a sign-in the board approved just before the cancel and a Paperclip that refuses `revoke-current`, when the owner cancels it, then the answer has `keyMayWork` and the error log says the key couldn't be revoked, without the key.
