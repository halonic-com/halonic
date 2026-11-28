# action-steppers.operation-step

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 2.4 and 6.8 and row C1; Liam's plan OK on HAL-21231; task HAL-20275

Where a stepper definition has an `operation` step, which names one of the sender's own operations (`actionOperations` of `@halonicjs/ports`) and a `manual: { url, instructions }` form, the action-steppers package shall give it the route the shell's list holds: `kind: "operation"`, the operation and its service, risk `admin`, each of the operation's placeholders (`actionOperationFields`) with the pattern of the definition's parameter of the same name, each of the operation's secret fields as a `secret-input` body field, and nothing kept. `routesOf` shall throw when the definition's risk isn't `admin`, when its service isn't the operation's, and when its parameters aren't exactly the operation's placeholders. The manual guide shall show an operation step's manual form as it shows a `call` step's, and a failed operation step shall stop the stepper at it on resume.

## Examples

- Given an `admin` Paperclip definition with the parameters `host`, `company` and `name` and one `paperclip.set-secret` operation step,
  when its routes are built,
  then step 1 is an operation route with those three placeholders, the body field `value` of kind `secret-input`, and nothing kept.
- Given the same definition with the risk `routine`, the service `github`, the parameter `name` missing, or an extra parameter `agent`,
  when its routes are built,
  then it throws, naming the definition and the step.
