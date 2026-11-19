# std.word-diff

- Status: active
- Since: unreleased
- Source: HAL-12856, so What changed can mark the words a sentence edit changed instead of showing two whole texts to compare by eye

The word-diff function shall cut each of two texts into pieces that join back to that text, each piece marked changed when the other text doesn't have it. It shall compare words, runs of spaces and single punctuation characters, keeping the longest run of common ones. The spaces at either end of a changed run shall be left unmarked.

## Examples

- Given "Write short sentences." and "Write short, warm sentences.", when they are diffed, then the text after has ", warm" marked changed and the rest unmarked, and the text before has nothing marked.
- Given "Use English." and "Use Dutch.", when they are diffed, then "English" is marked in the text before and "Dutch" in the text after.
- Given two texts that are the same, when they are diffed, then nothing is marked.
- Given an empty text and "Be kind.", when they are diffed, then the text before has no pieces and the whole text after is marked.
