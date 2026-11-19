# Decision: the `routines watch` hint of `init --example acme` fits 80 columns

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13643
- Kind: user-visible

The `halonic routines watch` hint in the `Next:` block of `init --example acme` reads "routines start on time only while it runs" instead of "routines start on time only while this runs", so the line is 79 columns instead of 81. It fits an 80-column terminal again, and the README's 80-column recording (HAL-6395, HAL-6366) can be taken again. The words stay those of HAL-9091 and of the Studio's Routines page ("start on time only while"); only "this" becomes "it". The test of the copy now also checks that no line is wider than 80 columns.

Maya decided the wording on the task as a small change to an approved screen (board, HAL-2282); Liam owns the command line and approves this note in review.

## Covers

- cli.commands.init.copy-example
- apps/cli/src/commands/init/golden/example.txt
