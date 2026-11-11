# Decision: the Search page ranks names from the match it highlights

- Approval: the maintainer approves this change in review of HAL-1290 (12b, follow-ups from HAL-4919)
- Kind: internal

The requirement is made more exact; nothing it promised before is taken away, and no test was
weakened. These are the code review's follow-ups on #1594 (HAL-4919).

- With "Match case" or "Whole word" on, a name was ranked by a case-blind match anywhere in it,
  while the highlight showed where the options let the words match. "refund Refund" searched for
  `Refund` with Match case ranked as starting with the words. The rank now comes from the same
  match as the highlight, so `matchName` takes the page's options. Ctrl K passes none, so it
  ranks as before.
- "In the order Ctrl K ranks names" read as the same order, but Ctrl K also puts recently opened
  items first among equals and the page doesn't. The requirement now names the ranks instead.
- An item two providers found kept only the first provider's result, so a description only the
  second gave was never searched. A later result now adds the description or detail the first
  one left out.
- Back on the Search page brings back the words, not the chips. The requirement now says so, so
  the page drawn in 12b doesn't promise more.

Two examples are added.

## Covers

- shell.search-page-names
