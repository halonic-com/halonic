# studio.src-tauri.crates.agent-host.relay-limits

- Status: draft
- Since: 0.1.0
- Source: HAL-7379, HAL-7659; security review HAL-5407 (W9, section 6)

While the relay serves a host, it shall keep at most 256 connections open, as the host does, and shut any connection it accepts past that without telling the host or giving it an id. Of the 64 frames that may wait for the host's input, it shall let one connection queue at most 8, and wait to read more from that client until one of them reached the host, so a client sending a big body leaves room for the others. It shall send the resets it owes the host without waiting for the host to read.

When the host has taken 30 seconds to read one frame, the relay shall stop and close every connection, so no client and none of its threads wait on the host for good. When a connection's first request has not carried the host's token in its `Authorization` header within 10 seconds of opening, the relay shall close it and reset it at the host, so a process without the token can't hold the connections Studio needs.

## Examples

- Given a relay with its limit of connections open,
  when another client connects,
  then the relay shuts it, the host gets no `open`, and the next client after a connection closed gets the next id.
- Given a client that sends far more than the queue holds while the host reads nothing,
  when a second client connects,
  then the host gets the second client's `open` after at most that client's share of frames, not after the whole queue.
- Given a host that reads none of its input while a client sends a big body,
  when 30 seconds pass,
  then the relay closes every client and refuses new ones, and once the host reads again it gets what was queued, then its input closes.
- Given a client whose first request carries a wrong token, and one whose request carries the right one,
  when 10 seconds pass,
  then the relay closes the first and resets it at the host, and the second is still served.

## What it doesn't cover

The share is per connection, not per client: it keeps one client's big body from filling the queue, not a hostile client that opens eight connections. Any process of the same user can already do more harm than that.

The token check only looks at the first request's head (at most 16 KiB): the host checks every request itself. A process without the token can still open connections over and over, each for up to 10 seconds; that, too, is less than a process of the same user can already do. A relay that stopped because the host read nothing leaves the host running until the shell stops it.
