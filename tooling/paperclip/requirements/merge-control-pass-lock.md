# paperclip.merge-control-pass-lock

- Status: active
- Since: unreleased
- Source: HAL-17884; HAL-17875 (a board edit of the Merger's state raced a live pass and was written over)

The plugin shall write merge control's state only while that company's pass lock is held, shall refuse a write to it from outside the lock or after the holder's turn ended, and shall make a second holder wait until the first one's turn ends, also when the first one failed.

## Examples

- Given no lock held,
  when merge control's state is written,
  then the write is refused, and a write to other plugin state passes.
- Given a live pass that has read the state,
  when a board edit takes the lock,
  then it waits, reads what the pass wrote, and neither change is lost.
