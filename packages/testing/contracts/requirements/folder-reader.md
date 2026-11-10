# contracts.folder-reader

- Status: active
- Since: 0.1.0
- Source: HAL-1735 plan, decision D1, approved by Liam on HAL-4038 (sort by code unit with "/" separators; hash what `read` gave); `FolderReader` port v1. A plugin's trust fingerprint is built from what the reader gives, so it hides nothing and follows no link

Where an adapter implements `FolderReader`, `entries` shall list every entry under the folder, recursively, with its kind and a file's size, sorted by code-unit order, with paths from the folder's root; it shall list `.git`, `.env` and other names a workspace keeps private; and it shall give `[]` for a folder that doesn't exist or a file. With a `limit`, it shall give at most `limit + 1` entries. `read` shall give a file's exact bytes, a fresh copy each time, and `null` for a missing file, a folder or a path under a file. A link shall be listed as a link, with nothing listed through it; reading, listing or locating a link or anything through it shall be refused with a `RangeError`, and so shall reading a special file. Every method shall refuse an unsafe path with a `RangeError`. `locationOf` shall give the folder's location, a distinct location for an entry, and `null` for a missing entry.

## Examples

- Given files `B.txt`, `a.txt`, `a-c` and `a/b`,
  when the folder is listed,
  then the order is `B.txt`, `a`, `a-c`, `a.txt`, `a/b`.
- Given two files whose bytes differ but aren't valid UTF-8,
  when both are read,
  then each gives its own bytes.
- Given a link `acme/latest` to a folder that holds `secret.txt`,
  when `acme/latest/secret.txt` is read,
  then it is refused with a `RangeError`, and `entries("acme")` lists only the link.
- Given four files,
  when the folder is listed with a limit of 2,
  then it gives 3 entries.
