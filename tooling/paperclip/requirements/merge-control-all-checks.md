# paperclip.merge-control-all-checks

- Status: active
- Since: unreleased
- Source: HAL-18344, from HAL-18324: #5999 and #6000 had 106 and 102 check runs on their heads, `ci-ok` wasn't among the first 100 the facts reader read, so merge control saw it missing and never enqueued them while the Merger did

When a pull request the gate looks at has more check runs on its head than the first rollup page holds, merge control's facts reader shall read the following pages, up to 500 check runs in all, before the gate reads the pull request's checks, and shall count each of those reads in the pass's request line. When a following page can't be read, the reader shall keep the check runs read so far, log which pull request's check runs were cut off, and go on with the pass.

## Examples

- Given a ready, approved pull request whose head's first rollup page has 100 green check runs without `ci-ok` and whose second page has a green `ci-ok`,
  when merge control runs a pass,
  then it enqueues that pull request, and the request line counts the second page's query.
- Given the same pull request where GitHub doesn't answer the second page,
  when merge control runs a pass,
  then the pass finishes without an error, logs that the pull request's check runs were cut off, and doesn't enqueue it.
