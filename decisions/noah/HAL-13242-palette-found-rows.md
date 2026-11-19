# Decision: Ctrl K shows every item a search provider found, not only those whose name matches

- Task: HAL-13242
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13242 (Iris's C157 check, HAL-13229, PS1; decided by the team under HAL-2282, Sofia as designer, with no new words; Liam reviews the pull request on HAL-13242 and signs this note)
- Kind: user-visible

## What changes

`runs.search` says typing "#01jd" in Ctrl K finds run 01jd8q. The Runs provider finds it, but the
palette kept only rows whose name holds the typed words, and "Run 01jd8q · Support reply" doesn't
hold "#01jd", so Ctrl K said "No results". The same dropped any item a provider found by something
other than its name, such as an agent found by its id or description, which the Search page shows.

`shell.palette-groups` now says the palette shows every item a search provider found for the
words. Rows whose name matches still come first, ranked and marked as before. An item found some
other way comes after them, with nothing marked, in the provider's order. Open and recent places
still need their name to match, since no provider vouches for them. Two examples record this, with
a test for each. No example was removed, and no test was weakened or skipped.

## Covers

- shell.palette-groups
