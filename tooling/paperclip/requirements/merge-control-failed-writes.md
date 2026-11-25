# paperclip.merge-control-failed-writes

- Status: active
- Since: unreleased
- Source: HAL-17783; Liam's and Julian's review of HAL-17706 (a failed write was never tried again; writes followed redirects)

When merge control's write to GitHub fails, the plugin shall keep none of what that action recorded as sent (the comment's once-per-head note, the rerun's or flake rerun's entry, the dequeue's unmergeable time, the enqueue's place in the last queue), so the next pass decides it again; and it shall send each write without following a redirect, counting a redirect answer as a failed write.

## Examples

- Given `act` mode and a pass whose rerun and comment writes fail,
  when the pass saves its state,
  then the rerun's and the comment's entries are as they were before the pass, and the next pass sends them again.
- Given `act` mode and a pass whose writes all go out,
  when the pass saves its state,
  then the rerun's and the comment's entries are kept, and the next pass doesn't send them again.
- Given GitHub answers a write with a 302 to another address,
  when the client sends it,
  then the request was sent with redirects off, nothing follows the redirect and the write fails with status 302.
