# Decision: the acme example gets three tools, so the init golden lists them

- Approval: HAL-17951 (step 1a-4 of plan HAL-17450 rev 5, which Liam approved: "the public example workspace with a few tool definitions"); Liam signs this note in review
- Kind: user-visible

`examples/acme` gets `library/tools` with three tool files (`pr_status`, `my_prs` and `task_get`), so `halonic build paperclip-plugin` has a public workspace to build, and a CLI test can build it twice and compare the bytes. `halonic init --example acme` copies the whole folder, so its golden output lists the three new files. Nothing else in it changes: the same checks pass and the counts only grow by the three files.

## Covers

- apps/cli/src/commands/init/golden/example.txt
