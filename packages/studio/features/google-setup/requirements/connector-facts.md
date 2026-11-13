# google-setup.connector-facts

- Status: active
- Since: 0.1.0
- Source: HAL-715; google-setup-flow (HAL-621) section 5.2; HAL-1063

The Google setup feature shall turn an account's setup record into the library's connector-neutral facts, so the library's connector status view shows the same state as the setup item: "Not connected" before the first sign-in, "Connected" after a sign-in nobody refused, "Needs sign-in" when Google refused the sign-in, and "Needs new secret" when Google refused the client secret or no longer knows the client. The chip lives in the library's connector status view until a second feature needs ordered header badges. An API switched off during a run is not in the record, so the facts keep the API on.

## Examples

- Given an account that never signed in,
  when its state is read,
  then it is "Not connected".
- Given a refused sign-in,
  when its state is read,
  then it is "Needs sign-in".
- Given a refused client secret, or a client Google no longer knows,
  when its state is read,
  then it is "Needs new secret".
