# runs.run-view.guided-run

- Status: active
- Since: unreleased
- Source: HAL-13434 (first-run build 6); first-run-flow 3.4 and section 6, approved by the board on HAL-7993; first-run-progress 2 (HAL-7986): the escalations change the one waiting line, never add a second part

Where a run's card is given a guided run's **Pick another model**, such as the first run's, the card shall show the run's waiting line (`runs.run-view.slow-step-line`) above its banner while the run is running. While the run waits on a model, the line shall escalate by how long it has waited: for a model from a provider with a key, "This is taking longer than usual. The model is still working." from 20 seconds, then "Still no answer. You can keep waiting, or use another model. Nothing is lost." with **Pick another model** from 60 seconds; for a model on this computer, "Loading the model. The first run is slow." from 20 seconds, and that "Still no answer" sentence with **Pick another model** only from 3 minutes. A model counts as on this computer when its provider's kind is local or the provider is Ollama. A failed banner of such a run shall offer **Try again** in place of Run again, and **Pick another model** after it; when the run's last model call was to a model on this computer and the run failed because the model's answer wasn't one of the options, it couldn't use tools, it fell silent (`model-timeout`) or its step failed, the banner shall add "This model may be too small for the *Sorter*. Try a larger one, or use Sample answers.", naming that call's agent, and offer **Pick another model** before **Try again**. A card without it shall show no waiting line and its banners as before.

## Examples

- Given a guided run waiting 25 seconds on Anthropic,
  then its card's line says "Waiting for Anthropic" and "This is taking longer than usual. The model is still working.", with no Pick another model.
- Given a guided run waiting 61 seconds on Anthropic,
  then the line says "Still no answer. You can keep waiting, or use another model. Nothing is lost." and offers Pick another model.
- Given a guided run waiting 2 minutes on Ollama,
  then the line says "Loading the model. The first run is slow." and offers no other model yet.
- Given a guided run that failed because the Sorter's answer on `llama3.2` wasn't one of the options,
  then the banner adds "This model may be too small for the Sorter. Try a larger one, or use Sample answers." and offers Pick another model, then Try again.
- Given a guided run that failed because Ollama didn't answer at all,
  then the banner says so as usual, with Try again, then Pick another model, and no "too small" line.
