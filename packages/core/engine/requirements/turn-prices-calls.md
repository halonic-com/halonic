# engine.turn-prices-calls

- Status: active
- Since: 0.1.0
- Source: HAL-2108; decided on HAL-2103 after the CI fact-check on HAL-2096 (E7); one price formula with the bridge since HAL-2285

Where a model turn has a run log, the engine shall write the `cost` of each `llm.response` from the model that answered: when the model has a price, what `priceOf` from the ports package gives (requirement `ports.model-price`), the same as the bridge records for that call; when it has none and its provider is local (`local: true`, such as Ollama, LM Studio or the mock model), 0; otherwise no `cost`, so the call counts as unpriced in the run's summary.

## Examples

- Given a model priced at 2 per million input tokens and 8 per million output tokens,
  when it answers with 1,000,000 input and 500,000 output tokens,
  then the `llm.response` has `cost` 6.
- Given a local model without a price,
  when it answers,
  then the `llm.response` has `cost` 0, and a run of only such calls has `unpricedCalls` 0.
- Given a model that is neither priced nor local,
  when it answers,
  then the `llm.response` has no `cost`, and the run's summary counts the call in `unpricedCalls`.
- Given a model priced at 3 per million input tokens and 15 per million output tokens,
  when it answers with 1,000 input and 500 output tokens,
  then the `llm.response` has `cost` 0.0105, exactly what the bridge records for the same call.
