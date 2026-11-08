# integration-kit.scoped-tokens

- Status: active
- Since: 0.1.0
- Source: HAL-135 (Ravi's input on HAL-99)

The kit shall let an integration read and write only the tokens its policy declares, stored under a name no other integration can reach, and its host shall offer only `http`, `tokens`, `settings` and `wait`.

## Examples

- Given the `weather` integration with token `refresh`,
  when it sets the token,
  then the shared store holds it as `i7_weather_refresh`.
- Given a token name the policy doesn't declare,
  when the integration reads it,
  then the kit throws.
