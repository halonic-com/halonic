# app.workspace-compare

- Status: active
- Since: unreleased
- Source: HAL-1293, save model 6.3

When a file changed outside Halonic and the user has unsaved changes to it, the kernel shall give Compare both texts and the text Halonic last read. It shall offer a combined text only when a three-way line merge of the two texts over the text Halonic last read has no conflict, and both sides still have the file. When the user keeps their own text, then the unsaved changes shall stay and the next save shall overwrite the outside text. When the user uses the other text, then the unsaved changes to the file shall be dropped. When the user combines both, then the file shall get the combined text, and if the two texts can't be combined, then the kernel shall refuse with a `CannotCombineError` and change nothing. After any choice, the next save of the file shall be written. Using the other text or combining both shall be one undo step.

## Examples

- Given Halonic read a three-line `a.yaml`, another program changed line 1 and the user changed line 3,
  when Compare is opened,
  then the combined text has both changes.
- Given both sides changed line 2,
  when Compare is opened,
  then there is no combined text, and combining both is refused.
- Given the other program deleted the file,
  when Compare is opened,
  then there is no combined text.
- Given the user chose Keep mine,
  when they save,
  then the file holds their text.
- Given the user chose Use the other one,
  when they undo,
  then their text is unsaved again.
