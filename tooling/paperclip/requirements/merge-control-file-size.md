# paperclip.merge-control-file-size

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); the board, 21 Nov 22:50; HAL-15461

When a ready candidate grows a measured file, the plugin shall add the file's lines on `main`, the net change of each queued pull request to it and its own net change, and if that is over the 500-line limit keep it out with one comment per head that names the file and the sum; a re-export barrel or a file already over the limit on `main` shall not hold it.

## Examples

- Given a 460-line file, a queued +30 and this pull request's +20,
  when two passes run,
  then it isn't enqueued and the comment saying 510 lines is posted once.
- Given a barrel, a file over the limit on `main`, or a shrinking file,
  when a pass runs,
  then it is enqueued.
