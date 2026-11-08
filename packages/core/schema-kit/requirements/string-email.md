# schema-kit.string-email

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3)

The `email()` check shall accept the email addresses Zod 4 accepted and report `invalid_format` for anything else.

## Examples

- Given `s.string().email()` and "family@example.com",
  when it is parsed,
  then it passes.
- Given the same schema and "a@b" (no dot in the domain),
  when it is parsed,
  then there is one `invalid_format` issue.
