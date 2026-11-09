# integration-kit.request-body-limit

- Status: active
- Since: 0.1.0
- Source: HAL-994 (I5 design v0.2 on HAL-958, section 3.3; attack case A27)

The limited client shall refuse to send a request body larger than 720 KiB (737,280 bytes), measured on the bytes sent: text as UTF-8, a form after encoding, bytes as they are. It shall refuse with `request-too-large` and send nothing. A body it can't measure before sending, such as a stream, a `Blob` or `FormData`, shall be refused as `body-not-supported`. The limit may be lowered, never raised, so an integration behaves the same in-process and in the fenced runner. A limit that isn't a finite number (`NaN`, `Infinity` or `-Infinity`) shall be held at 737,280 bytes, and a negative finite one shall count as 0.

## Examples

- Given a body of exactly 737,280 bytes as text, bytes or a form,
  when the integration sends it,
  then the transport receives it unchanged.
- Given one byte more, in any of those forms,
  when the integration sends it,
  then the kit throws `request-too-large` and sends nothing.
- Given text of 245,761 three-byte characters (under the limit in characters, over it in UTF-8),
  when the integration sends it,
  then the kit throws `request-too-large`.
- Given a form body under the limit that a secret placed in a form field pushes over it,
  when the integration sends it,
  then the kit throws `request-too-large`, and the message holds no secret value.
- Given a `Blob` or a `FormData` body,
  when the integration sends it,
  then the kit throws `body-not-supported` and sends nothing.
- Given a lower limit in the request limits, or a higher one,
  when the integration sends a body between the two,
  then the lower one refuses it, and the higher one is held at 737,280 bytes.
- Given a limit of `NaN`, `Infinity` or `-Infinity` in the request limits,
  when the integration sends a body of 737,281 bytes,
  then the kit throws `request-too-large`.
- Given a negative limit in the request limits,
  when the integration sends one byte, an empty body or no body,
  then the kit refuses the byte with `request-too-large` and sends the other two.
