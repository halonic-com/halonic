# format.provider-searches-web

- Status: active
- Since: unreleased
- Source: HAL-13603, Liam's approval on HAL-13604 (Julian's note on HAL-13590)

When `parseFile` reads a provider file, the format shall accept an optional `searchesWeb`: a list of the model ids at that provider that search the web by themselves, each a non-empty string listed once. It has no default, so a file without it reads as before and has no `searchesWeb`. A model id listed twice fails with `duplicate` at that entry. The ids are matched exactly, case and all, against a model alias's `model`; a suffix such as OpenRouter's `:online` is not matched.

## Examples

- Given `id: openrouter` and `type: openai-compatible` only, when it is parsed, then it has no `searchesWeb`.
- Given `searchesWeb: [perplexity/sonar, perplexity/sonar-pro]`, when it is parsed, then `searchesWeb` holds those two ids in that order.
- Given `searchesWeb: [perplexity/sonar, perplexity/sonar]`, when it is parsed, then it fails with `duplicate` at `searchesWeb.1`, saying searchesWeb lists perplexity/sonar twice in providers/openrouter.yaml.
- Given `searchesWeb: [""]`, when it is parsed, then it fails at `searchesWeb.0`.
- Given `searchesWeb: perplexity/sonar`, a single id instead of a list, when it is parsed, then it fails at `searchesWeb`.
