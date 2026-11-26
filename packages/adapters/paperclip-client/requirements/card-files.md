# paperclip-client.card-files

- Status: active
- Since: unreleased
- Source: board report on HAL-10 (26 Nov, "I also dont see attachments in the approval cards in studio"); task HAL-19494, plan approved by Liam on HAL-19502 with its conditions

When the Paperclip provider lists a card for the person, it shall give the card the files of the newest post with files on the card's task made strictly before the card: the files of one comment, or of one run when they have no comment, oldest first and at most 20. A file made after the card, in the same second or later, shall never count, and a card with no earlier post shall have no files. An approval shall get its files the same way from its first linked task only, and none when it is linked to no task. Paperclip links no file to a card or an approval: the files an agent shows with one are attached to a comment or a run on the same task.

The provider shall read a task's file list only when the task has a card for the person, once each time the task changes, and an approval's files once while it waits. A task Paperclip has no file list for has no files; any other failure of that read fails the list, as a failed read of the task's cards does.

When asked to read a file, the provider shall read it only when the last list gave it to a card, under the same task, and only as a PNG, JPEG, GIF or WebP picture of at most 10 MB whose leading bytes match its stated type. It shall refuse any other file, type or size, by its stated length or by the bytes that came, without reading the rest of its body, and shall refuse an ID it didn't list, or one that names another task, before any request.

## Examples

- Given Bo's comment on task ACME-7 with `launch-light.png` and `launch-dark.png`, an earlier comment with `old.png`, and Bo's card "Launch on Friday?" made after them,
  when the provider lists the Inbox,
  then the card has `launch-light.png` and `launch-dark.png`, and not `old.png`.
- Given the same card and a `notes.pdf` posted after it,
  when the provider lists the Inbox,
  then the card doesn't have `notes.pdf`.
- Given a file the card lists that Paperclip serves as `image/png` but whose bytes are HTML,
  when Studio asks to read it,
  then the provider refuses it as an unsupported type.
