# std.async-feed

- Status: active
- Since: unreleased
- Source: HAL-12237; the agent host's `RemoteControl` streams its state and each pairing's events to Studio

When items are pushed to an `AsyncFeed`, it shall keep them in order until its one reader reads them, so a reader that comes later or reads slowly gets every item, and a reader that waits shall get the next item as soon as it is pushed. When the feed has ended, the reader shall get the items already queued and then the end, and an item pushed after the end shall be ignored. When the reader leaves early, the feed shall drop its queue, end a read that waits, and tell the writer once.

## Examples

- Given a feed with 1 and 2 pushed and then ended, when a reader reads it, then it gets 1, 2 and the end.
- Given a reader that waits, when "ready" is pushed, then it gets "ready".
- Given a reader that breaks out of its loop after the first item, when the writer pushes again, then the writer has been told once and the reader gets nothing more.
