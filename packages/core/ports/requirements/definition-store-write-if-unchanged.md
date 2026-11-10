# ports.definition-store-write-if-unchanged

- Status: active
- Since: 0.1.0
- Source: save model 1.7 (HAL-1102), routing note task 3 (HAL-3236), HAL-3247, HAL-3383; `DefinitionStore` port v2

When `write(path, content, { expected })` is called, the `DefinitionStore` port shall write only if the file still holds what the caller last read: `expected` is that text's digest (`sha256:` and the 64 lowercase hex characters of the SHA-256 of its UTF-8 bytes, as `contentDigest` works it out) or `absent` for a file that should not exist yet. The store shall return `written`, or `changed-on-disk` with the file's current text (`null` when it is gone) and write nothing. Writes and removes of the same path from one store shall run one after another, so another write or a remove from that store never comes between the check and the write. A write without `expected` shall replace the file as before. `@halonicjs/std` shall export `contentDigest` and `matchesExpected` (`std.content-digest`), so every store compares the same way. The `definition-store` contract suite shall check every adapter against this.

## Examples

- Given `a.yaml` = "1",
  when `a.yaml` is written as "2" with the digest of "1",
  then the result is `written` and `a.yaml` is "2".
- Given another editor changed `a.yaml` to "3" after Halonic read "1",
  when `a.yaml` is written as "2" with the digest of "1",
  then the result is `changed-on-disk` with current "3", and `a.yaml` stays "3".
- Given no `b.yaml`,
  when it is written with `expected: absent`,
  then the result is `written`; given `b.yaml` already exists, the same write is `changed-on-disk` with its text.
- Given `a.yaml` was removed outside Halonic,
  when it is written with the digest of "1",
  then the result is `changed-on-disk` with current `null`.
- Given `a.yaml` = "1",
  when two writes with the digest of "1" run at the same time,
  then one is `written` and the other is `changed-on-disk` with the first one's text.
- Given `a.yaml` = "1",
  when it is written with the digest of "1" and removed at the same time,
  then the write is `written` and `a.yaml` is gone afterwards; when the remove comes first, the write is `changed-on-disk` with current `null`.
- Given the text "hello",
  when `contentDigest` is asked for it,
  then it is `sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824`.
