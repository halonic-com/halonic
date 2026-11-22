# studio.trust-review-program-changes

- Status: active
- Since: unreleased
- Source: HAL-16469 (C706 row 5 on HAL-16419): a Changed program shows old → new, as mockup-trust section 2 draws it (old in `fg-muted`, the arrow in `fg-subtle`, new in weight 500, no strikethrough)

When a trusted program changed, the desktop app's trust check shall show, in its Changed row, each value that changed as the old value, an arrow and the new value: the command and its arguments, and each line under it (`studio.trust-review-program-fields`). An `env` entry is paired with the old entry of the same name. The new value shall show in `fg` at weight 500, and a value with no old value to pair with shall be marked as new the same way. Unchanged lines shall stay as they are, and a field the program no longer has shall show no line. A screen reader shall hear a changed value as "was …, now …" and a new one as "new: …", never the arrow.

## Examples

- Given a trusted program whose `env` entry `NODE_OPTIONS` changed from `--require ./setup.js` to `--require ./other.js`,
  when its check opens,
  then its Changed row reads **Environment** `NODE_OPTIONS=--require ./setup.js` → `NODE_OPTIONS=--require ./other.js`, and a screen reader hears "was NODE_OPTIONS=--require ./setup.js, now NODE_OPTIONS=--require ./other.js".
- Given a trusted program `npx @acme/mail-mcp 2.3.1` that now runs `npx @acme/mail-mcp 2.4.0`,
  when its check opens,
  then its Changed row reads `npx @acme/mail-mcp 2.3.1` → `npx @acme/mail-mcp 2.4.0`.
- Given a trusted program that gains the `env` entry `LOG_LEVEL=debug` and keeps its working folder,
  when its check opens,
  then `LOG_LEVEL=debug` shows in weight 500, marked as new, and **Working folder** shows as before.
