# cloudflare-storage.erase-scope

- Status: active
- Since: unreleased
- Source: selling layer S1-4 (HAL-13216), delete by scope; plan revision 4, approved on HAL-17260

The R2 blob store's `eraseAll` shall delete every object under the store's prefix, across as many listed pages as there are, and no object outside it, and shall refuse with a `RangeError`, deleting nothing, when the prefix is empty or only `/`. The D1 record store's and run list's `eraseScope` shall delete every row of their own scope (the record changes, the compaction claims and the run list rows) and no row of another scope, even one whose scope starts with theirs. Erasing again, or erasing what is empty, shall do nothing.

Rationale: deleting a person's or an organisation's data deletes it from every store, and a prefix that reached the whole bucket would delete every customer's blobs at once.

## Examples

- Given two blobs and another object under `u/eu_a/`, and a blob under `u/eu_ab/`, when the first store is erased twice, then nothing is left under `u/eu_a/` and the other blob is there.
- Given a blob store with the prefix `""`, `/` or `//`, when it is erased, then it throws `RangeError`.
- Given records, a compaction claim and a run row under `u/eu_a` and under `u/eu_ab`, when the first scope is erased, then it has none of them and the second has all of them.
