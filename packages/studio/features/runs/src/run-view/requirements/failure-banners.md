# runs.run-view.failure-banners

- Status: active
- Since: unreleased
- Source: HAL-13725 (the proxy line, decided by the team); HAL-14324 (C343 ST2 and ST3: setup causes the engine names, and an address without a host; team decision by Liam, wording from Sofia's c343 check); HAL-12411 (R8: the provider by its file's name, UX check on HAL-12390, microcopy 1.6 E6, revision 113); HAL-12035 (`budget` from the engine's cause, decided by Liam on the task); HAL-1845 part 2; failure-states (HAL-1712) F6, F7, F8, F10, F15 and F20; microcopy 22 (HAL-751, revision 48, approved on HAL-1720) and 15.3; ux-checklist-failure-states (HAL-1847) FX-D2; the fixed reason in F6, the model instead of the alias in F7 and no buttons yet are team decisions on HAL-1845

When a run failed for a reason the engine names, the run page's banner shall say the cause in plain words, in the danger tone, instead of "Halonic can't tell the cause yet":

- `sandbox-start-failed`: "*Reporter* didn't start: the sandbox on this computer didn't start. Nothing ran.", with the agent that started last, or "The agent" when the log names none;
- `model-unreachable` for a provider that runs elsewhere: "Halonic couldn't reach *Claude* at api.anthropic.com for the model alias *smart*. This computer may be offline. Check your internet connection, then run again."; for a provider that runs on this computer: "…*Ollama* may not be running on this computer. Start *Ollama*, then run again." with **Open Models**; on a phone: "Halonic couldn't reach *Ollama* on your computer (localhost:11434) for the model alias *smart*. Start *Ollama* there, then run again." with "Fix this on your computer: Models" and no button. Where the log gives no alias, the sentence says "the model *claude-sonnet*" instead. The page picks the sentence by the provider's kind, never by the host name. The host is left out when the engine gave none. When the engine gave an empty host, because the provider's address has none (such as `localhost:11434` without `http://`), the banner for any provider reads "Halonic couldn't reach *Ollama* for the model alias *local*: its address has no host. Check *Ollama*'s address in Models. It starts with http:// or https://, such as http://localhost:11434." with **Open Models** (on a phone "Fix this on your computer: Models" and no button), and never "at  for". A provider that is no longer in the workspace gets the sentence for a provider that runs elsewhere When the run's cause is a proxy's (`proxy.*`, from the CLI's HTTP client or the desktop shell's, HAL-13725), the banner says it was the proxy instead: "Halonic couldn't reach *Claude* at api.anthropic.com through your proxy: *the shell's sentence*", the sentence with a lower-case first letter (unless it starts with "Halonic") and a full stop, or "…through your proxy." when the cause gives none, with **Model calls through a proxy ↗**, which opens the how-to;
- `model-out-of-memory`: "*Ollama* couldn't load llama3.1:70b: this computer doesn't have enough free memory for it.", then "Close other programs, or pick a smaller model in Models." with **Open Models**, and on a phone "Close other programs, or pick a smaller model." with the line "Fix this on your computer: Models";
- `disk-full`: "*Support reply* stopped in the step *Draft reply*: the disk is full, so Halonic couldn't write the run log. Free some space, then run again.";
- `model-missing` for a provider that runs on this computer: for Ollama "Ollama is answering, but it doesn't have *llama3.2* yet. Run ollama pull llama3.2 in a terminal, or pick another model in Models." with **Copy command** (copies `ollama pull llama3.2`) and **Open Models**; for another local provider "*LM Studio* is answering, but it doesn't have *model* yet. Download it in *LM Studio*, or pick another model in Models." with **Open Models** only; on a phone "Ollama on your computer doesn't have *llama3.2* yet. Run ollama pull llama3.2 in a terminal there, or pick another model in Models." (another provider: "*LM Studio* on your computer doesn't have *model* yet. Download it there, or pick another model in Models.") with "Fix this on your computer: Models" and no button. A cloud provider keeps the general banner;
- `model-timeout`: for a local provider "*Ollama* didn't start answering at localhost:11434 within 5 minutes. It may still be loading the model." (on a phone "*Ollama* on your computer didn't start answering within 5 minutes. It may still be loading the model."); for any other "*Claude* didn't start answering within 5 minutes, so the step *Draft* stopped. Nothing you set caused this.";
- `model-no-tools`: "*llama3.2*, used by the model alias *fast*, can't use tools, and the step *Draft* offers tools. Point the model alias *fast* at a model that can use tools." with **Open Models** before **Run again**, because running again fails the same way until the alias changes; a log without the alias reads "*llama3.2* can't use tools, and the step *Draft* offers tools. Pick a model that can in Models, then run again.";
- `models.unknown-provider-type`, read from the run's cause with the facts `halonic run` words (`app.run-failure`): "*Support reply* failed in the step *Draft*: provider *mock* has type *antropic*, which Halonic can't call.", then "Pick a type Halonic knows for *mock* in Models, then run again." with **Open Models**;
- `models.unknown-model-alias`, read the same way: "*Support reply* failed in the step *Draft*: hub *support* has no model alias *smart*.", then "Add it in Models, or set a model on the agent." with **Open Models**. On a phone, both setup banners end with "Fix this on your computer: Models" and have no button. A cause that lacks the names its sentence needs, and a cause no banner here names, keep the general banner (`runs.run-view.unknown-cause-details`);
- `interrupted`: "*Support reply* stopped because Halonic's engine stopped during the step *Draft reply*. Nothing after that step ran.", and for a run that never entered a step "…stopped because Halonic's engine stopped before the first step. Nothing ran.".

When a run stopped at its budget and its `run.failed` cause (`events.run-failed-cause`) is `budget.run` or `budget.month` with the limit, the spend and the currency, the run page's budget banner (amber, titled "Stopped at its estimated budget") shall say what `halonic run` says on its first line, in the budget's currency, and in Studio's words, without the workspace key names (HAL-12069), on its second, with a **Change budget** button that opens Workspace settings at its Budget block (`workspace.open-budget`) in the same tab, as the Inbox's does, and is left out where the page can't do that: for the run's budget "*Support reply* stopped in the step *Draft*: this run reached its budget of €5.00 (estimated €5.08 spent)." and "Change the budget, then run again.", and for the month's "…: this month's estimated spend reached its budget of €50.00." and "Change the budget, or wait until it resets on 1 January (UTC).", where the date is the first of the month after the run stopped (UTC). The banner shall read the cause only, never the error text. A budget stop without a cause, or with a figure missing from it, shall keep the general line "*Support reply* stopped in the step *Draft*.". The budget banner's last line says the budget is checked before each step and that a step can make several model calls, so a run can go over, as the Models step's How the budget works says (HAL-12742).

The model and its provider shall come from the log's last model call, the host from `run.failed`. A banner shall name the provider by the `name` its file gives (microcopy 1.6, E6); for a provider whose file names none, or that is no longer in the workspace, by its known name (Anthropic, OpenAI, Gemini, Ollama, LM Studio for the ids `anthropic`, `openai`, `gemini`, `ollama`, `lmstudio`), and else by its id as written, never by its id with a capital ("Openai", "Lmstudio"). A banner that needs the model shall wait for the log, and until then the page's general banner shows. The engine's own error text, and the provider's, shall never be on the banner; the proxy line's sentence comes from the cause's `detail`, which the HTTP client wrote for the person.

**Open Models** opens the workspace page at Models and is left out where the page can't do that. On a phone the banners that offer it (`model-unreachable` for a local provider or an address without a host, the two setup causes, `model-out-of-memory`, `model-missing`, `model-no-tools`) have no button for it: they end with "Fix this on your computer: Models". **Run again** (`runs.run-view.run-again`) comes last.

Limits, for the docs: the banners have no **Copy details** yet. The model is named instead of its alias for a log that doesn't give the alias.

## Examples

- Given a run that stopped with the cause `budget.run`, a limit of 5, a spend of 5.08 and the currency EUR, in the step Draft,
  when its page is shown,
  then the budget banner reads "Support reply stopped in the step Draft: this run reached its budget of €5.00 (estimated €5.08 spent).", then "Change the budget, then run again.".
- Given a run that stopped with the cause `budget.run`, a limit of 0.0003 and a spend of 0.0004,
  then the first line reads "…: this run reached its budget of less than €0.001 (estimated less than €0.001 spent).", never "of under".
- Given a run that stopped with the cause `budget.month` on 31 December,
  when its page is shown,
  then the second line reads "Change the budget, or wait until it resets on 1 January (UTC).".
- Given a run that stopped at its budget with no cause,
  when its page is shown,
  then the banner's first line reads "Support reply stopped in the step Draft." with no second line about the budget key.

- Given a run that failed with `model-unreachable` at api.anthropic.com after a call to the provider `claude`, a cloud provider, with the model claude-sonnet,
  when its page is shown,
  then the danger banner reads "Halonic couldn't reach Claude at api.anthropic.com for the model claude-sonnet. This computer may be offline. Check your internet connection, then run again.".
- Given a run that failed with `model-unreachable` at `localhost:11434` after a call to the provider `ollama`, a local provider,
  when its page is shown,
  then the banner says Ollama may not be running on this computer.
- Given a run that failed with `model-unreachable` and an empty host after a call to the provider `ollama`,
  when its page is shown,
  then the banner reads "Halonic couldn't reach Ollama for the model llama3.2: its address has no host. …" with **Open Models**.
- Given a run that failed with the cause `models.unknown-model-alias`, the alias smart and the hub support, in the step Draft,
  when its page is shown,
  then the banner reads "Support reply failed in the step Draft: hub support has no model alias smart.", then "Add it in Models, or set a model on the agent.", with **Open Models**.
- Given a run that failed with a cause code no banner names,
  when its page is shown,
  then the banner reads "Support reply failed in the step Draft. Halonic can't tell the cause yet.".
- Given a run that failed with `disk-full` in the step Draft,
  when its page is shown,
  then the banner reads "Support reply stopped in the step Draft: the disk is full, so Halonic couldn't write the run log. Free some space, then run again.".
- Given a run that failed with `interrupted` before it entered any step,
  when its page is shown,
  then the banner reads "Support reply stopped because Halonic's engine stopped before the first step. Nothing ran.".
- Given a run that failed with `model-out-of-memory` on a phone,
  when its page is shown,
  then the banner ends with "Fix this on your computer: Models".
- Given a run that failed with `model-unreachable` at api.anthropic.com with the cause `proxy.unreachable` and the sentence "couldn't reach the host through the proxy: check HTTPS_PROXY and the proxy",
  when its page is shown,
  then the danger banner reads "Halonic couldn't reach Claude at api.anthropic.com through your proxy: couldn't reach the host through the proxy: check HTTPS_PROXY and the proxy." with **Model calls through a proxy**, and never "This computer may be offline".
