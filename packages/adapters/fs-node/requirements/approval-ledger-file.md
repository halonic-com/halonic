# fs-node.approval-ledger-file

- Status: active
- Since: unreleased
- Source: HAL-19462 (plan, PR 2), HAL-19486; `LedgerStore` from `@halonicjs/auto-approvals`

The file approval ledger store shall keep the auto approvals shadow ledger as one file with one JSON entry per line, in a folder with mode `700` and a file with mode `600`, and shall resolve `append` only once the line is flushed to disk. It shall have no method that changes or removes an entry. A store opened again on the same file shall go on from its last entry. Reading shall skip a line torn by a crash and leave the file as it is; the next `append` shall cut it off first. An `append` that fails shall cut the file back to its whole entries. A whole line that isn't a JSON object shall make reading throw, naming the line. A symbolic link, a hard link or anything but a plain file in the file's place shall be refused, never read or written through. The store assumes it is the only writer of its file.

## Examples

- Given a ledger of two entries whose store was closed,
  when a new store on the same file appends,
  then the entry's index is 2 and `verifyChain` returns `{ ok: true }`.
- Given a file that ends in half a line,
  when a new store appends,
  then the half line is gone and the chain is whole.
