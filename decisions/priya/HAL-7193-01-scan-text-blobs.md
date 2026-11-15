# Decision: the export scans text blobs for secrets, and a binary blob is exported unscanned

- Approval: [HAL-10435](/HAL/issues/HAL-10435#comment-6a88ede0-f995-41fd-b888-f998468c1a5a) (scope set on HAL-7193, approved by Liam as package owner)
- Kind: user-visible

## What changes

`runtime.export-data`: a blob that is valid UTF-8 text is now scanned for key shapes, with the same
`secret_found` refusal and code as the rest of the export. A blob that is not valid UTF-8 is exported
unscanned. The scan reads the blob in chunks and carries the trailing run of key characters (at most
4 KiB, found by walking back from the end of the chunk) into the next chunk, so a key that spans a chunk
boundary is still found and a large blob never becomes one string. The requirement also says, in one
sentence, that only common key formats are known. Two examples are added (a key in a text blob is
refused; a binary blob is exported unscanned). No existing text or example was removed or weakened.

## Why

A key in a text blob went through the export without being checked. An operator whose export used to
pass can now get a 409 for a text blob, so this counts as something a user sees. Chunking keeps the
scan within a Worker's memory for a blob near the import limit.

## Covers

- runtime.export-data
