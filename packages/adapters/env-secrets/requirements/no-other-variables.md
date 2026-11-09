# env-secrets.no-other-variables

- Status: active
- Since: 0.1.0
- Source: HAL-2109; HAL-2096 (E3, E6)

The environment secrets shall read only variables that start with `HALONIC_SECRET_`, never the old `STUDIO_SECRET_` prefix or a provider's own variable such as `OPENAI_API_KEY`.

## Examples

- Given `STUDIO_SECRET_SERVE_PASSWORD=old` and `OPENAI_API_KEY=key`,
  when `serve-password`, `openai`, `OPENAI_API_KEY` and `openai-api-key` are read,
  then each gives `null`, and every variable looked at starts with `HALONIC_SECRET_`.
