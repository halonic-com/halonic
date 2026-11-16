# runs.run-view.failure-banners

- Status: active
- Since: 0.1.0
- Source: HAL-1845 part 2; failure-states (HAL-1712) F6, F7, F8, F10, F15 and F20; microcopy 22 (HAL-751, revision 48, approved on HAL-1720) and 15.3; ux-checklist-failure-states (HAL-1847) FX-D2; the fixed reason in F6, the model instead of the alias in F7 and no buttons yet are team decisions on HAL-1845

When a run failed for a reason the engine names, the run page's banner shall say the cause in plain words, in the danger tone, instead of "Halonic can't tell the cause yet":

- `sandbox-start-failed`: "*Reporter* didn't start: the sandbox on this computer didn't start. Nothing ran.", with the agent that started last, or "The agent" when the log names none;
- `model-unreachable` for a provider that runs elsewhere: "Halonic couldn't reach *Claude* at api.anthropic.com for the model claude-sonnet. This computer may be offline. Check your internet connection, then run again."; for a provider that runs on this computer: "…*Ollama* may not be running on this computer. Start *Ollama*, then run again." The page picks the sentence by the provider's kind, never by the host name. The host is left out when the engine gave none. A provider that is no longer in the workspace gets the sentence for a provider that runs elsewhere;
- `model-out-of-memory`: "*Ollama* couldn't load llama3.1:70b: this computer doesn't have enough free memory for it.", then "Close other programs, or pick a smaller model in Models.", and on a phone "Close other programs, or pick a smaller model." with the line "Fix this on your computer: Models";
- `disk-full`: "*Support reply* stopped in the step *Draft reply*: the disk is full, so Halonic couldn't write the run log. Free some space, then run again.";
- `interrupted`: "*Support reply* stopped because Halonic's engine stopped during the step *Draft reply*. Nothing after that step ran.", and for a run that never entered a step "…stopped because Halonic's engine stopped before the first step. Nothing ran.".

The model and its provider shall come from the log's last model call, the host from `run.failed`. A banner that needs the model shall wait for the log, and until then the page's general banner shows. The engine's own error text, and the provider's, shall never be on the banner.

Limits, for the docs: the banners have no **Run again**, **Open Models** or **Copy details** yet, because the page has no Run again and the banner has room for one action. They come with those. The provider is named by its id with a capital until the engine logs a display name, and the model is named instead of its alias until the engine logs the alias.

## Examples

- Given a run that failed with `model-unreachable` at api.anthropic.com after a call to the provider `claude`, a cloud provider, with the model claude-sonnet,
  when its page is shown,
  then the danger banner reads "Halonic couldn't reach Claude at api.anthropic.com for the model claude-sonnet. This computer may be offline. Check your internet connection, then run again.".
- Given a run that failed with `model-unreachable` at `localhost:11434` after a call to the provider `ollama`, a local provider,
  when its page is shown,
  then the banner says Ollama may not be running on this computer.
- Given a run that failed with `disk-full` in the step Draft,
  when its page is shown,
  then the banner reads "Support reply stopped in the step Draft: the disk is full, so Halonic couldn't write the run log. Free some space, then run again.".
- Given a run that failed with `interrupted` before it entered any step,
  when its page is shown,
  then the banner reads "Support reply stopped because Halonic's engine stopped before the first step. Nothing ran.".
- Given a run that failed with `model-out-of-memory` on a phone,
  when its page is shown,
  then the banner ends with "Fix this on your computer: Models".
