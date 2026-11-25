# paperclip.state-packet

- Status: active
- Since: unreleased
- Source: HAL-17402 (board approved 25 Nov, with Liam's design review of 24 Nov); built on HAL-18684

When the server asks the Agent tools plugin's `state-packet` data key for a task's packet before an `issue_monitor_due` run starts, while the `statePacket` setting is on, and one or more of the task's pull requests in the PR watcher's snapshot are on an `<agent>/HAL-<n>-<words>` branch that names the task, the plugin shall answer a state packet with one line per pull request and the task's 3 newest comments.

Each pull request line shall give its state, its head, `ci-ok`, whether it is mergeable, the reviewers with a signed approval on the head and its merge queue position, and shall carry its own `dataAsOf`, the time its data was read from GitHub. For a merged pull request, the line shall give `ci-ok` on the merge commit instead of the head.

If a line's data is more than 5 minutes old when the packet is built, the plugin shall read that pull request again from GitHub before it answers, and shall keep the new line for the next wake. A merged pull request whose merge commit's `ci-ok` finished shall not be read again.

The comments shall be marked as untrusted task data, each JSON-quoted and cut to 500 characters. The whole packet shall stay within 6,000 characters (about 1.5k tokens); over that, the oldest comments shall be left out first.

The plugin shall answer no packet, with the reason, and the run shall start as it does without one, if the setting is off, the wake is another kind, the task has no pull request on such a branch, the snapshot or a kept line can't be read, a read from GitHub fails, the pull request lines alone are over the cap, or the build takes longer than 8 seconds. It shall never answer half a packet.

## Examples

- Given the setting is off (its default),
  when the server asks for HAL-41's packet before a monitor wake,
  then the answer is no packet.
- Given the setting is on and HAL-41's pull request #41 on `ada/HAL-41-fuel`, read by the watcher 2 minutes ago,
  when the server asks before a monitor wake,
  then the packet has #41's line with `dataAsOf` the snapshot's time, and nothing is read from GitHub.
- Given the snapshot is 7 minutes old,
  when the server asks,
  then #41 is read again from GitHub, its line carries the time of that read, and the line is kept.
- Given the task's only pull request is on `ada/rocket-fuel`, or the snapshot can't be read,
  when the server asks,
  then the answer is no packet.
- Given #40 merged with a green `ci-ok` on its merge commit,
  when the server asks,
  then its line says `ci-ok success on the merge commit`.
- Given a 2,000-character comment,
  when the server asks,
  then the packet shows its first 500 characters, JSON-quoted, and the packet is at most 6,000 characters.
