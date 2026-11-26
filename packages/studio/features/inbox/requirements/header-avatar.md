# inbox.header-avatar

- Status: active
- Since: unreleased
- Source: the board's feedback on HAL-19536, item 3 (bigger avatars, especially in headers), plan approved by Liam on HAL-19539; the shared header of HAL-19192; built on HAL-19586; the list's rows grew to 60px pictures with the board's bigger sidebar rows (HAL-10, HAL-19735)

When an agent's or a person's item is open, the Inbox shall show the asker's picture at 40px before the line that says who asks and the item's title, as the Messenger's chat header does. The list's rows shall keep their own 60px sidebar pictures (`kit.plain-row-size`).

## Examples

- Given a question from Chief, whose title is Chief of Staff,
  when you open it,
  then a 40px picture with "C" sits before "Chief · Chief of Staff asks" and the question's title.
- Given the same question,
  when the list shows it,
  then its row's picture stays the sidebar's 60px.
