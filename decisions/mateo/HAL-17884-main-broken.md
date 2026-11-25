# Decision: a group that fails only on files its pull request doesn't touch is main broken, not a culprit

- Task: HAL-17884
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-17884 (the board session asked for this on HAL-17762, from HAL-17875, 24 Nov 21:10 and 21:33 UTC; Liam approves this note in review)
- Kind: internal

`paperclip.merge-control-culprit-hold` gets one exception: when a merge group fails only on files the blamed pull request doesn't touch, main is broken and nobody is held.

- The new requirement `paperclip.merge-control-main-broken` defines main broken as the live Merger's `pass.js` does it since 24 Nov 22:20. Every failed job's failure annotations name files, and none of them is a file the pull request changes. Then the pull request isn't held or told, "main broken" is recorded once in its own state field, and the main-red freeze starts for `^revert\b` unless the board already set one. A job without file annotations (typecheck, tests) keeps the old culprit hold.
- Why: on 24 Nov the Leak guard failed on files #5723 had brought to `main`, and the hold rule took out every pull request whose group ran into it (#5737, #5762, #5779, #5785 and more) although none of them touched those files.
- The culprit-hold examples and tests stay as they were; the new cases are in `main-broken.test.ts`.

## Covers

- paperclip.merge-control-culprit-hold
