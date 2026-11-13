# library.connection-state

- Status: active
- Since: 0.1.0
- Source: HAL-1063; HAL-715; Sofia's layout review (HAL-7814); Liam's plan approval (HAL-7815)

The Library feature shall give one function that turns what is known about a connector (configured, signed in, secret accepted, API on) into one of five states: Connected, Needs sign-in, Needs new secret, API off and Not connected. When more than one thing is wrong, the function shall name the one to fix first: the secret, then the sign-in, then the API. A connector that is not set up shall be Not connected whatever else is true. Each state shall have one label and one tone in a single table: Connected is success, the three that need action and Not connected are attention (amber, "have a look"). The function and the table shall be exported through the feature's `api.ts`, so the status view and the badges cannot disagree. The function shall take connector-neutral facts only, never a connector's own records.

## Examples

- Given a connector that is set up, signed in, with a valid secret and its API on,
  when its state is read,
  then it is Connected, with tone success.
- Given a connector whose secret was refused and whose sign-in is also gone,
  when its state is read,
  then it is Needs new secret.
- Given a connector that is not set up,
  when its state is read,
  then it is Not connected, with tone neutral.
