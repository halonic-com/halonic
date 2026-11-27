# files.ui.tree-rows

- Status: active
- Since: unreleased
- Source: HAL-20744 (P5 of the HAL-20617 build plan, the Code screen); the list row of the part recipes on HAL-20672, at a tree's height

The Files view shall draw each row of the file tree at least 36px high with 8px corners, 10px inside the edges of its column, and each level 16px further in than the one above. The row under the pointer and the row of the file in the active tab shall have the same `surface-muted` fill, and the name of the file in the active tab shall also be in medium weight, so the open file never rests on its fill alone. The view shall cut that name to its row's room at the widths of its medium weight, so it keeps its start and its end as the other names do (`files.ui.tree-view`).

## Examples

- Given the tree shows `src/index.ts`,
  then the row `src` is at least 36px high with 8px corners, and `index.ts` starts 16px further in.
- Given `models.yaml` is open in the active tab,
  then its row is the selected one, with the `surface-muted` fill and its name in medium weight.
- Given the pointer is over another row,
  then that row has the same fill and its name stays in regular weight.
- Given a long file name is open in the active tab and its row has room for 13 characters in medium weight,
  then the name shows cut in the middle to 13 characters, though 16 would fit in regular weight.
