# Decision: the CommandBox breaks only between words, and Copy goes under it when narrow

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14552 (decided in Sofia's C415 check, CB1; the shell-word rule from her C442 check on HAL-12368); the package owner's reviewer (Liam) approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:cEViKKzGYDl2+w9hvOpWxdGhZZpQescd0IQIh+l0LAdTam05frearGg+Z1S0tPgChxZdgnWzRLnpVJAQFApvAQ==

## What changes

`kit.command-box`: the command no longer wraps anywhere. It breaks only at the spaces between its shell
words, never after the hyphens of a flag like `--filter`, and inside a word only when that one word is
wider than the whole box. Each word is its own inline block; a word wider than the box wraps anywhere. Where fewer than 192px would be left for the
command beside "Copy command", the button goes under the command. Two examples are added: a 195px box, and `--filter` at 200 % zoom.

In `command-box.test.tsx`, the first example no longer checks for `wrap-anywhere`. Three new examples check
that each shell word is its own unbreakable block (`--filter` whole, the text unchanged), that only a word
wider than the box wraps inside, and the 192px basis that puts Copy under the command. No other check is removed.

## Why

At 195px Copy stayed beside the command and the command broke inside words over 8 lines, so
`--network` or a path came out in pieces. Sofia's check C442 (HAL-12368) then found `overflow-wrap:
break-word` still breaks after the `--` of `--filter` at 200 % zoom, so words are now inline blocks.
The connect page's hint already breaks only between words.

## Covers

- kit.command-box
- packages/studio/kit/src/command-box/command-box.test.tsx
