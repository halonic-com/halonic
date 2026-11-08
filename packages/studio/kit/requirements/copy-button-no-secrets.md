# kit.copy-button-no-secrets

- Status: active
- Since: 0.1.0
- Source: HAL-700; Google setup flow design, sections 3.1 and 4

The kit shall keep a secret field's value in a `SecretText`, which isn't a string, and `CopyButton` shall take only a string, so passing a secret is a type error. If a `SecretText` reaches `CopyButton` anyway (through a cast or untyped code), then the button shall throw a `TypeError` before anything reaches the clipboard. When a `SecretText` is turned into text by accident, it shall show `[secret]`, never the value.

## Examples

- Given a `SecretText`,
  when it is passed as a `CopyButton`'s `text`,
  then TypeScript reports an error.
- Given a `SecretText` cast to a string,
  when the `CopyButton` renders,
  then it throws "CopyButton copies plain text only. A secret field's value can never be copied." and the clipboard stays empty.
- Given a `SecretText`,
  when it goes through `String()`, a template string or `JSON.stringify`,
  then the result shows `[secret]`.
