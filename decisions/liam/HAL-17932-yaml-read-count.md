# Decision: the yaml read-time test counts value reads instead of timing

- Approval: HAL-17932 (item E of the merge-time report on HAL-17891, routed on HAL-17926); Liam wrote it, Julian reviews and signs it there
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:nrWsU6xNeGNWJE5gADwd36Etg9+uCsWAJbQh2MpQtW/OhyXcUItIzvoqT4cfJ2fITYbUhzG/mK7P5OCItpyaAQ==

The read-time test for `yaml.read-time` no longer times 2,000- and 16,000-key maps with the
wall clock over seven warmed-up rounds. It reads each map once and counts how often a parsed
value is read, through an accessor on the yaml library's `Scalar.prototype`. The sizes and
the bound stay: sixteen thousand keys must cost well under 16 times the reads of two
thousand. Linear reading gives exactly 8; the library's pairwise key check, or a pairwise
loop in our own, gives about 64. The requirement's text doesn't change.

The guard sees fewer `expect` calls (11 instead of 24) because the old test checked the data
after each of its nine timed reads; the new one checks it after each of its two.

## Why

The test took about 82 s on CI and could still fail on a stalled runner (HAL-17682). The
count follows the work, so the runner's speed or load can't change it, and the file runs in
about a second. What it no longer catches: a slowdown that never reads a parsed value, such
as one inside the lexer. Key comparison, which HAL-16339 fixed and the requirement names,
always reads values.

## Covers

- yaml.read-time
