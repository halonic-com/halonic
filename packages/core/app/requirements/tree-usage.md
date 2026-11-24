# app.tree-usage

- Status: active
- Since: unreleased
- Source: HAL-17255, token phase 1f; the tree rule of `treeCost` (`app.month-spend`)

When asked for the tokens of a run with its sub-runs, the app shall add up the `usage` of the run and of every run under it, at any depth, by the summaries' `parentRunId`, counting each run once, the calls a subscription paid for included. A run that isn't among the summaries used no tokens.

## Examples

- Given a run with 100/20 tokens, its child with 10/2 and 5 cache read tokens, a grandchild with 1/1, and another run with its own child,
  when the tokens of the first run are asked for,
  then they are 111 input, 23 output and 5 cache read tokens, and the child's alone are 11/3 with 5 cache reads.
- Given a run that isn't among the summaries, then its tokens are 0/0.
