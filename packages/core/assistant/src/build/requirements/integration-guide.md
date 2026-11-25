# assistant.build.integration-guide

- Status: active
- Since: unreleased
- Source: HAL-1309 plan rev 1, PR 1 (Liam's OK, 25 Nov); HAL-18266

The Build chat shall offer the model an `integration_guide` tool that takes the name of one top-level section of the integration guide (`docs/guides/integrations.md` in `halonic-com/integrations`) and answers with that section's text, so the whole guide never goes into every prompt. The sections are the text before the first top-level heading, named "Introduction", and one per `## ` heading, named by that heading's text. The guide shall be a copy pinned to one commit of `halonic-com/integrations`, whose SHA-256 is recorded next to it; the Build chat never fetches it. For a section the guide doesn't have, the tool shall answer "Error: the integration guide has no section "<section>". The sections are: <each section's name in quotes, separated by commas>.". The built-in authoring instructions shall tell the model to read the guide before it writes or changes an integration.

## Examples

- Given the pinned guide,
  when the model calls `integration_guide` with section `5. Tools`,
  then the result starts with "## 5. Tools" and ends before "## 6. Model providers, MCP and knowledge sources".
- Given the model calls `integration_guide` with section `Contents`,
  then the result lists the guide's numbered sections.
- Given the model calls `integration_guide` with section `Pricing`,
  then the result starts with "Error: the integration guide has no section "Pricing". The sections are: "Introduction", "Contents", "1. What an integration is"".
- Given the pinned copy was edited by hand,
  then its SHA-256 no longer matches the recorded one and the package's tests fail.
