# Decision: the problems band's file line says "this workflow", and an unreadable secrets file names your user account

- Approval: /HAL/issues/HAL-15771 (words check C625 of /HAL/issues/HAL-15749, rows 29 and 48), wording on an approved band and an approved refusal, decided by the team (HAL-2282)
- Kind: user-visible

**The problems band's file line.** The band's first line is "*Support reply* can't run: it has 2 problems.", where "it" is the workflow. The file line under it said "*Writer* has 1 problem that stops it.", where the nearest "it" is Writer, so it read as a problem that stops Writer. It now says "*Writer* has 1 problem that stops this workflow." ("3 problems that stop this workflow." for more). **Open writer.agent.yaml** stays as it is, so the button still makes sense on its own. The requirement `workflows.start.start-run` changes its rule and its example to the new words, and the tests that quoted the old line quote the new one; no test is removed or weakened.

**A secrets file you can't read.** The refusal said "The secrets file *path* can't be read by you." Halonic is the one reading, so "by you" made the person the cause. It now says "…can't be read by your user account.", the words the Windows fix already uses ("Give your user account access…"), so the line and its fix name the same thing. The fixes don't change. The requirement `secrets-file.unreadable` changes its example to the new words, and the test that quoted the old line quotes the new one; no test is removed or weakened.

## Covers

- workflows.start.start-run
- secrets-file.unreadable
