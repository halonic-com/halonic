# engine.record-tools

- Status: active
- Since: 0.1.0
- Source: HAL-1533, step 4(d) of the HAL-186 plan; the old engine's `find_`, `add_` and `update_` tools

When an agent has `collections`, the engine shall give it three tools for each one its hub can see. Their names use the collection's id, with every character other than a letter, a digit or `_` written as `_`. Each tool shall answer with JSON.

- `find_<id>` gives `{ records, total? }`: the records that match `where` (`engine.record-filter`), read through `view` when given, at most `limit` of them (1 to 200, default 200). Each record is its `id`, `values` with computed fields filled in, and `updatedAt`.
- `add_<id>` adds a record with the given values, checked as `engine.record-values` says, and gives it as stored. Without an `id`, the record gets one made from the collection's id, the time and the count.
- `update_<id>` changes only the given `values` of the record with `id`, and gives it as stored.

The engine shall log every change with the agent and, in a run, the run's id as `by`. Before it first reads a collection, it shall add each seed record whose id never appeared in its log, so a removed record doesn't come back.

The tool shall fail with an error, and change nothing, in these cases:

- the values have problems
- the id of a new record is blank or starts or ends with a space
- the id of a new record is taken: `A record "<id>" already exists in <collection>`
- the record to update doesn't exist: `No record "<id>" in <collection>`
- the view doesn't exist: `Collection "<id>" has no view "<view>" (views: …)`
- an argument has the wrong type

## Examples

- Given a clerk with `collections: [invoices]`,
  when its tools are built,
  then it gets `find_invoices`, `add_invoices` and `update_invoices`.
- Given a run `r-1` of the clerk,
  when it calls `add_invoices` with `{ supplier: "sup-1", amount: 40 }`,
  then the record store has one `add` change with `by: { agent: "clerk", runId: "r-1" }`.
