# Decision: say what's wrong when a subcommand comes after the command's options

- Task: HAL-2918, W10 of the words check of the `runs` pull requests (HAL-2909), cli-output revision 37
- Approval: the task asks for this change (a team wording decision, HAL-2282); the maintainer approves this note in review
- Kind: user-visible

## What changes

`halonic runs --limit 5 show 01JD8Q` printed "✕ Put show right after runs." Line 1 of a usage
error says what's wrong and line 2 is the fix (cli-output 1.3), but "Put …" was already a fix, and
the usage line under it repeated it. Line 1 now reads "✕ show goes right after runs, before any
options." The requirement's sentence and example change to match.

## What stays

The usage line on line 2 and exit code 2 don't change, and neither does the error for a word that
isn't a subcommand.

## Tests

No test was weakened. The `cli.subcommand-placement` test checks the new line 1 with the same
number of `expect` calls.

## Covers

- cli.subcommand-placement
