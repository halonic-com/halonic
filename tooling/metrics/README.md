# @halonicjs/tooling-metrics

Read-only scripts that collect the numbers we use to see whether our work
gets better over time. The first one counts review findings per pull
request, by severity tag (see
[docs/guides/review.md](../../docs/guides/review.md)).

- **Layer:** tooling
- **Owner:** julian
- **Public API:** `@halonicjs/tooling-metrics` (`findingsIn`, `severityOf`, `findingsTable`, `createReader`, `reviewFindings`)
- **Requirements:** `metrics.tagged-findings`, `metrics.findings-per-pull-request`

## Review findings per pull request

From the repo root:

```sh
GH_TOKEN=$(gh auth token) node tooling/metrics/src/cli/review-findings.ts --since 2026-10-13 --until 2026-11-10
```

It prints one row per pull request merged in the window (`--until` is left
out), with its `[blocker]`, `[major]`, `[minor]` and `[nit]` findings and a
total row. `--json` prints the rows as JSON instead, with the titles;
`--repo owner/name` reads another repository (default `halonic-com/halonic`).

What counts:

- Lines in reviews, inline review comments and conversation comments that
  start with a tag, after an optional list marker. The pull request
  description doesn't count.
- Quoted lines (`>`) and code blocks don't count, so a reply that quotes a
  finding doesn't count it twice.

It only sends GET requests, and only to `api.github.com`; it refuses to
follow a link to any other host, so the token stays with GitHub. A window of
a few hundred pull requests takes three requests per pull request; without
`GH_TOKEN`, GitHub allows only 60 requests an hour.
