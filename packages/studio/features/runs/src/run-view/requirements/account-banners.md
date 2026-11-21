# runs.run-view.account-banners

- Status: active
- Since: unreleased
- Source: HAL-12411 (UX check R1 to R6 on HAL-12390, microcopy 15.3 and revision 113 of 1.6 on HAL-751; small wording on an approved screen, a team decision under HAL-2282); HAL-12464 (the facts shared with the CLI, approved by Liam); HAL-14694 (C457-1: a key line names the model when no alias points at it, a team decision under HAL-2282)

When a run failed for a reason about the provider's account or the workspace's rules, the run page's banner shall say it in the danger tone, from the same facts as the CLI's failure lines (`app.run-failure`), with the model the run called last, its alias, the provider's secret and the agent:

- `key-refused` when no key was sent, because the secret holds none: "*Anthropic* has no API key on this computer, and the model alias *default* needs one." with **Add key**;
- `key-refused` when the provider turned the key away: "*OpenAI* didn't accept the key in the secret *openai-key*, used by the model alias *smart*. It may be mistyped, revoked, or for another account." with **Replace key**;
- `provider-busy`: "*Anthropic* was busy and asked Halonic to slow down, so the step *Draft reply* stopped. Nothing you set caused this.", and when the facts hold the tries "*Anthropic* was busy and asked Halonic to slow down. Halonic tried 3 times over 2 minutes and stopped the step *Draft reply*. Nothing you set caused this.";
- `out-of-credit`: "*OpenAI* refused the call because the account has no credit left or reached its limit at *OpenAI*. This isn't your Halonic budget.", with **Run again**, then the link **Open *OpenAI* billing** (15.3), only for a provider that calls Anthropic's, OpenAI's or Gemini's own API host, which opens that provider's billing page outside Studio;
- `model-missing` at a provider that runs elsewhere: "*Anthropic* doesn't have the model *claude-sonnet-9*, used by the model alias *smart*. Pick another model for *smart* in Models." with **Open Models**, which opens the alias's tab (*smart*) as `runs.run-view.failure-banners` does;
- `local-only`: "*Acme* is local only, so Halonic sent nothing to *OpenAI*. *Sorter*'s model alias *smart* points to a cloud model." with **Choose a local model for *Sorter*** and without **Run again**, which would fail the same way.

**Add key**, **Replace key** and **Choose a local model for *Sorter*** open the workspace page at Models, and **Open Models** the alias's tab; each is left out where the page can't do that, and on a phone the line "Fix this on your computer: Models" takes their place. They come before **Run again**, and there is no **Run again** for `local-only`. A banner names the provider as `runs.run-view.failure-banners` does, and the agent by its name from its file. While the log or the workspace's models aren't read, or when a fact is missing (such as a provider without a secret), the page's general banner shows. The engine's and the provider's own text shall never be on the banner. When no alias points at the model, the two key lines name the model instead of an alias: "…used by the model *gpt-4.1*." and "…and the model *gpt-4.1* needs one.", as the CLI's line 1 does.

Limits, for the docs: **Add key**, **Replace key** and **Choose a local model** open Models at its start; going straight to the provider's key or the agent's model comes later. The engine doesn't retry a busy provider yet, so the tries don't show yet.

## Examples

- Given a run that failed with `key-refused` after skipping the alias *default* at Anthropic because its secret holds no key,
  when its page is shown,
  then the banner reads "Anthropic has no API key on this computer, and the model alias default needs one." with **Add key**, then **Run again**.
- Given a run that failed with `out-of-credit` at a provider whose `baseUrl` is a company gateway,
  when its page is shown,
  then the banner has no billing link.
- Given a run of the local-only workspace *Acme* that failed with `local-only` after skipping *Sorter*'s alias *smart* at OpenAI,
  when its page is shown,
  then the banner reads "Acme is local only, so Halonic sent nothing to OpenAI. Sorter's model alias smart points to a cloud model." with **Choose a local model for Sorter** and no **Run again**.
