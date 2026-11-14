# @halonicjs/adapter-tool-approval-kit

The text format of the tool-approval files. Both file-based approval stores read each other's
files, so the format lives here once: it turns an approval, or the waiting tool versions of one
source, into file text and reads that text back, strictly. It never touches a file; the stores
decide where files live and how they are written.

- **Layer:** adapters
- **Owner:** tomas
- **Runtime:** any (Web-standard types only, no `node:` imports)
- **Public API:** `@halonicjs/adapter-tool-approval-kit`

## Public API

- `fileFormat` is the format number this version writes. A file with a higher number comes from a
  newer Halonic: it is never read as an approval and never overwritten.
- `Read<T>` is what a read gives: the value, or `damaged` text, or a `newer` file.
- `formatApproval(approval)` gives an approval's file text: the format first, then the key, in a
  fixed order, as two-space JSON with a final line break.
- `readApproval(key, text)` reads that text for `key`. It compares the file with the text it would
  write, so a file with a repeated key, an unknown key or another approval's key is never believed.
- `approvalFrom(value)` gives the approval in `value` with its parts in Halonic's order, or what is
  wrong with it. A store checks with it before writing, so it never writes what it couldn't read.
- `formatWaiting(key, waiting)` and `readWaiting(key, text)` do the same for the waiting versions
  of one source.

## Example

```ts
import { formatApproval, readApproval } from "@halonicjs/adapter-tool-approval-kit";

const text = formatApproval(approval);
const read = readApproval(approval, text); // { kind: "read", value: approval }
```
