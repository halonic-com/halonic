# runs.run-view.receipt-models-cost

- Status: active
- Since: unreleased
- Source: HAL-62 receipt requirements RCPT-2.5 and RCPT-3.3; the heading and line wording are a team decision under HAL-2282 (HAL-1301); the test model's line is D4 of HAL-12721 (HAL-12727)

The run page's receipt shall have a Models and cost section with one line per model: its calls, its tokens in and out, and its estimated cost, then one total line from the run's summary with the calls without a price beside it. A call without a price shall say "No price" and never count as zero. A cached answer shall say "cached, no model call", never a bare €0. A call the person's own subscription paid for shall say "on your subscription". A call priced 0 shall never show an amount: it says "no cost" and adds nothing to the total. The built-in test model's calls shall share one line named "Built-in test model", never its model id ("echo"), as in "Built-in test model · 3 calls · 218 in · 41 out · no cost". Cached calls beside fresh ones shall say "2 cached calls". Amounts shall be in the workspace's budget currency. A run with no model call shall have no section. The lines shall be plain text.

## Examples

- Given two priced calls to one model,
  then the section has one line for it with 2 calls and the tokens added up, then the total.
- Given a call without a price,
  then its line says "No price" and the total says "+ 1 call without a price".
- Given a cached answer,
  then its line says "cached, no model call".
- Given three calls the built-in test model answered with 218 tokens in and 41 out,
  then the section has one line, "Built-in test model · 3 calls · 218 in · 41 out · no cost", and no total.
- Given a run that made no model call,
  then the receipt has no Models and cost section.

## Not yet

- "on this machine, no cost" for a local model with no price needs the caller's list of models marked free (RCPT-3.5), which the run page does not pass yet.
