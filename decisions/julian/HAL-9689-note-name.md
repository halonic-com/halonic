# Decision: the note check fails a note with the wrong file name

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-9689
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:KTYa2cKBwQZA8ZQ0Vmd8wZBKB3AyOKfmb4ZD/SboLT27r49fnUESXlvDcpz/oS1rg2+ygK6fZXsr78XRFP0WBQ==
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:dhUotQZhCILeEw+3qzgIq5WO0SFX5G/2IdeLpFemfNmh3hqd020r6uUPWlbT+vLl9b/39LyENhPT56GS1K3YBA==

The note check only read `decisions/<branch>.md`, so a pull request could add its note under another name and pass with an unsigned note (found on #2768). It now fails any file a pull request adds under `decisions/` other than the branch's note, and tells the author to rename it. Notes already on the base branch stay as they are. A test and a line in `docs/guides/checks.md` cover it.

## Covers

- tooling/check/
