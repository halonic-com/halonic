# memory.unfenced-run-consent-store

- Status: active
- Since: 0.1.0
- Source: HAL-3385; `UnfencedRunConsentStore` port v1

The memory store of the yes to run plugin and integration code without the sandbox shall keep the yes as JSON text, so that every read gives a fresh copy. For tests, `damage()` shall make the yes unreadable, after which `get` throws. `damage` without a saved yes shall throw and create nothing.

## Examples

- Given a saved yes,
  when `damage` is called and the yes is read,
  then it throws an error saying the saved yes can't be read.
- Given an empty memory store,
  when `damage` is called,
  then it throws, and `get` still gives `null`.
