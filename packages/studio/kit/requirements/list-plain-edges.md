# kit.list-plain-edges

- Status: active
- Since: unreleased
- Source: Noah's visual check of the 26 Nov Studio merges (HAL-19905), the gaps fixed on HAL-19916: a plain List should line up with `PlainRow`'s rows (`kit.list-plain`); Noah's decision on HAL-19956 that a plain List's headings line up with its rows

When a `List` is `plain`, without checkboxes or columns, its rows shall start 12px in from the List's edge, as `PlainRow`'s do, and the List shall add no space above its first row or below its last, so a plain List and a `PlainList` of the same rows line up side by side. While it loads, its loading rows shall start 12px in as well and sit 4px apart with no space at the edges, so nothing moves when the rows arrive (`kit.plain-row-size`). The headings a plain List draws, its own and each group's, and their loading placeholders shall start 12px in as well, as the Messenger's "Chats" heading does. A bordered or flush List shall keep its 16px inset, rows and headings alike.

## Examples

- Given a plain List and a `PlainRow`,
  when both render,
  then the List's first row and the `PlainRow` both pad their content by 12px, and the List's grid takes back the 4px its row spacing puts above the first row.
- Given a bordered List,
  when it renders,
  then its rows pad their content by 16px.
- Given a plain List and a bordered List, each with a heading,
  when both render,
  then the plain List's heading is padded 12px from the side and the bordered List's 16px.
- Given a plain List that is loading with an avatar in each row,
  when its loading rows show,
  then they pad their content by 12px and sit 4px apart, as the real rows do.
