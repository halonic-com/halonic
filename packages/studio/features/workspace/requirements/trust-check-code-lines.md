# workspace.trust-check-code-lines

- Status: active
- Since: unreleased
- Source: HAL-16420 (C706 row 3): paths, env entries and sites showed in the text font under a command in mono (mockup-trust section 5, microcopy 4.3)

When the trust check shows a line whose value is code, such as a path, an env entry or a site, it shall show that value in the mono font, as it shows the row's command. Its label shall stay in the text font.

## Examples

- Given a program row with **Environment** `LOG_LEVEL=debug`,
  when the person opens the check,
  then `LOG_LEVEL=debug` is in mono and "Environment:" is not.
