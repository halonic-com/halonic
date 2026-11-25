# action-steppers.stepper-preview

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 7.1 and 7.3; task HAL-17517

When a validated stepper request is previewed, the action-steppers package shall list everything it touches in one sentence before anything runs, naming each service target exactly and counting the pages it opens per host, and shall give each block its lines in order: a shipped definition's or step type's own preview for its parameters, and for a `browser` block the full address that will open, with the requester's instructions and result label kept apart under "Instructions from <requester>, not checked by Halonic".

## Examples

- Given a request setting a variable on the invented repository `acme/app`, adding a DNS record to `acme.example` and opening one GitHub page,
  when it is previewed,
  then the sentence is "This stepper touches: GitHub repository `acme/app`, Cloudflare zone `acme.example`, and opens 1 page on `github.com`."
- Given a `browser` block with instructions,
  when it is previewed,
  then its lines show the full address, and its instructions sit under "Instructions from <requester>, not checked by Halonic".
