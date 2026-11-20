# studio.first-run-key-never-shown

- Status: active
- Since: unreleased
- Source: HAL-13431; first-run-flow revision 7, section 3.3 and 10.2 R4, approved by the board on HAL-7993; the security rules are Liam's plan on HAL-13431

The first run's model choice shall hold the pasted key in none of its answers, reasons or errors, whether the test passes or fails, and whether saving the key or the files fails.

## Examples

- Given the key store fails with a message that repeats the key,
  then the reason Continue gives names the failure without the key.
