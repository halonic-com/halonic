# studio.src-tauri.crates.agent-host.relay-limits

- Status: draft
- Since: 0.1.0
- Source: HAL-7379; security review HAL-5407 (W9, section 6)

While the relay serves a host, it shall keep at most 256 connections open, as the host does, and shut any connection it accepts past that without telling the host or giving it an id. Of the 64 frames that may wait for the host's input, it shall let one connection queue at most 8, and wait to read more from that client until one of them reached the host, so a client sending a big body leaves room for the others. It shall send the resets it owes the host from one thread, however many there are.

## Examples

- Given a relay with its limit of connections open,
  when another client connects,
  then the relay shuts it, the host gets no `open`, and the next client after a connection closed gets the next id.
- Given a client that sends far more than the queue holds while the host reads nothing,
  when a second client connects,
  then the host gets the second client's `open` after at most that client's share of frames, not after the whole queue.

## What it doesn't cover

The share is per connection, not per client: it keeps one client's big body from filling the queue, not a hostile client that opens eight connections. Any process of the same user can already do more harm than that.
