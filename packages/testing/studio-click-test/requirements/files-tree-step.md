# studio-click-test.files-tree-step

- Status: active
- Since: unreleased
- Source: HAL-20764, the review of #6871 (HAL-20744): a user-visible Studio requirement comes with a click step (`docs/guides/checks.md`, HAL-18716)

When the steps of `studio-click-test.places-open` have run, the click test shall widen the window to 1280 × 800, where the sidebar is docked, switch the sidebar to Files, and check the file tree of the demo, reading every part under the switch's own panel, since Code's page can show a second file tree in the window (`files.ui.tree-search`, `files.ui.tree-rows`). It shall type "writer" in "Search files" and pass that search when a count shows under the field, every file row the tree shows has the text in its path, and the count reads the words for that many rows, such as "1 file". While that search holds the folders open, it shall read a row at least 32px high with 8px corners, the tree's 10px of padding, a row at the top starting 13px in, and a row one level in starting 16px further in. It shall press Escape and require no count and as many rows as before the search, then do the same for "agents/", which reads "3 files" in a fresh demo. Whatever it found, it shall switch the sidebar back to Studio and give the window its size back. It shall fail with the first failing part's code: `NO_FILES_VIEW` without the Files tab, `NO_FILE_TREE` without rows or the field, `NO_SEARCH_COUNT`, `SEARCH_SHOWS_OTHER_FILES` when a file row lacks the text or a search shows no file row at all, `SEARCH_COUNT_WRONG`, `NO_NESTED_ROW` when no row sits one level in, `TREE_ROW_LOOK` with every size that is off in its note, `SEARCH_NOT_CLEARED` when the count stays after Escape, `TREE_NOT_BACK` when the rows differ from before, and `SIDEBAR_NOT_RESTORED` when a passing step can't switch back to Studio.

## Examples

- Given the demo, whose tree shows `writer.agent.yaml` under `hubs`, `support` and `agents` for "writer" with "1 file" under the field,
  then step 35 passes, having typed "writer" and "agents/" and pressed Escape twice, and the sidebar shows the places again.
- Given a sidebar without the Files tab,
  then step 35 fails as `NO_FILES_VIEW`, and the window gets its 800 × 600 size back.
- Given a tree that shows 2 file rows for "writer", one without it in its path,
  then step 35 fails as `SEARCH_SHOWS_OTHER_FILES`.
- Given a tree that shows a count for "writer" but no file row,
  then step 35 fails as `SEARCH_SHOWS_OTHER_FILES`.
- Given a Files view that shows its rows without the "Search files" field,
  then step 35 fails as `NO_FILE_TREE`, having typed nothing.
- Given a tree that shows 1 file row for "writer" under a line that reads "2 files",
  then step 35 fails as `SEARCH_COUNT_WRONG`, and its note names "1 file".
- Given rows 28px high with 6px corners,
  then step 35 fails as `TREE_ROW_LOOK`, and its note names both.
- Given a tree that shows 2 more rows after Escape than before the search,
  then step 35 fails as `TREE_NOT_BACK`, and the sidebar still goes back to Studio.
- Given a word copied from a file that no longer holds it, or an Acme example where "writer" no longer matches 1 file and "agents/" 3,
  then the package's own tests fail.
