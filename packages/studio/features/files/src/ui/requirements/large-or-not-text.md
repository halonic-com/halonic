# files.ui.large-or-not-text

- Status: active
- Since: 0.1.0
- Source: HAL-329 files flow 4.5 (limit 1,000,000 characters); HAL-10534, HAL-11169; HAL-11383

The file tab shall open a file of more than 1,000,000 characters in the code editor, read-only, under the line "This file is large, so it opens read-only.", and send no edit to the workspace's files for it. When the first 8 KB of a file hold a zero byte, the tab shall say "This file can't be shown here." with the file's size, and show no editor.

## Examples

- Given `big.md` holds 1,000,001 characters, then the editor opens read-only, the line "This file is large, so it opens read-only." shows above it, and typing changes nothing.
- Given `big.md` holds exactly 1,000,000 characters, then it opens as usual and no line shows.
- Given `logo.png` holds a zero byte early on, then the tab reads "This file can't be shown here." with its size, and no editor shows.
- Given `big.md` opens read-only, then its Problems list reads "This file is too long to check." in place of "No problems.".
