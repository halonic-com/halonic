# Decision: the run page names a model provider by its file's name

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12411 (UX check R8 on HAL-12390, microcopy 1.6 rule E6, revision 113 on HAL-751; small wording on an approved screen, a team decision under HAL-2282)
- Kind: user-visible
- Task: HAL-12411

`runs.run-view.failure-banners` named a provider by its id with a capital, which reads "Openai"
and "Lmstudio", and said so under its limits. Sofia's UX check (R8) and microcopy 1.6's rule E6 say
a provider is named by the `name` in its file, never by a capitalised id. So:

- `runs.run-view.failure-banners` now says a banner names the provider by the `name` its file
  gives; for a provider whose file names none, or that is gone, by the known name of its id
  (Anthropic, OpenAI, Gemini, Ollama, LM Studio); else by the id as written. Its examples for
  another local provider read "LM Studio" instead of "Lmstudio", and the limit about the
  capitalised id is removed.
- `studio.workspace-runs` adds that the app gives each provider's kind and the `name` its file
  gives, which it already read for the kind.

Two tests' expected words change: the LM Studio `model-missing` banner now expects "LM Studio"
instead of "Lmstudio", and a provider that is gone, with the id `elsewhere`, is now "elsewhere"
as written instead of "Elsewhere". No test is removed or weakened; the test context gives the providers their
names, so the other expectations ("Claude", "Ollama") stay as they were, and new tests cover the
file's name, the known names and an unknown id.

## Covers

- runs.run-view.failure-banners
- studio.workspace-runs
