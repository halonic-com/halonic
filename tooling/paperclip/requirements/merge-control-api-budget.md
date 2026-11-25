# paperclip.merge-control-api-budget

- Status: active
- Since: unreleased
- Source: HAL-17913; board instruction via Chief on HAL-17912 (24 Nov): the Merger's account hit GitHub's 5,000 calls an hour and its passes stopped; the read-only GitHub App's token (`githubToken`) takes every read, and the merge queue token keeps only the writes

When a merge control pass runs, the plugin shall read the open pull requests, the queue and the runs in one snapshot, read the `githubToken` secret once at the start of the pass for all of the snapshot's REST and GraphQL reads, serve a GET read less than 90 seconds before from its cache without counting it as a GitHub call, send only the queue's writes with the merge queue token, and count each token's calls per UTC hour against its own configured budget.

If a read answers 401, then the plugin shall read the `githubToken` secret once more and retry once.

If a token's remaining budget is below its threshold, or GitHub refuses the read token twice or says its limit is used up, then the pass shall end with a degraded result instead of an error, and the next pass shall wait the configured minutes; a pass with the read budget low shall skip the reads only shadow mode and the known-flake check need.

When a pass ends, the plugin shall log one line with each token's calls in that pass, its remaining budget and when it resets, and no token.

## Examples

- Given 30 open pull requests answered 10 per page,
  when a pass reads the facts,
  then GitHub receives 3 pull request pages and no read for any single pull request.
- Given a pass that read the runs lists,
  when the next pass runs 60 seconds later,
  then those GETs aren't sent and the request count says 0 REST GETs.
- Given a read that answers 401 and then 200,
  when the pass reads,
  then the token is read twice and the retry carries the second token.
- Given a pass whose reads leave 500 of the read budget, under the threshold of 1000,
  when the pass ends,
  then it returns a degraded result, the summary says "reads 10 this pass, 500 of 12000/h left", and the next pass a minute later waits.
- Given a pass in act mode with three writes,
  when it ends,
  then every request on the merge queue token is a POST and the summary counts the writes apart from the reads.
