# runs.run-view.key-origin-asked

- Status: active
- Since: unreleased
- Source: HAL-15831; flow check C638 #5 on HAL-15825: the question stayed a raw event line while its answer had words

The run log view shall show a `key-origin.asked` event as one line in words, in place of its event line, with its number and its time with seconds: `Asked whether provider "{provider}" may send key "{key}" to {address}.` The line shall write a hidden or direction-changing character as its escape.

## Examples

- Given a run whose log holds `key-origin.asked` with provider "Gateway", key "gateway-key" and address `https://gateway.example.com` at 09:14:00,
  when the run log is shown,
  then that line reads `09:14:00 Asked whether provider "Gateway" may send key "gateway-key" to https://gateway.example.com.`
