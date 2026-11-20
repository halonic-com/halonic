# Decision: review prints no approve command for a tool its server keeps changing

- Task: HAL-13715
- Approval: HAL-13715 (bug from the real-run QA pass on HAL-13712; team decision under the HAL-2282 rule for small wording on an approved flow)
- Kind: user-visible

## What changes

- `halonic tools review <source>` no longer prints "To approve this version on purpose: halonic tools approve <source> <tool> --fingerprint <fp>" under a tool its server keeps changing. It says "Once <source> stops changing it, review asks about it again within a day: halonic tools review <source>".
- Review's last line names the tools that stay off because their server keeps changing them: "! 1 tool from notes-mcp stays off because notes-mcp keeps changing it: search. 3 tools are on." When other tools were asked about, that line comes just before the usual last line. It no longer says "Nothing from <source> is waiting for your approval." while such a tool stays off.

Exit codes and `--json` stay the same. `tools approve` doesn't change: naming a tool still approves it as it is now, and `--all` still leaves such a tool out. No test was weakened or skipped. The tests, the golden file and the requirement's examples name the new wording.

## Why

`approve` lists the tools again before it approves. A server that keeps changing a tool has a new version by then, so the printed command always failed with exit 5, and its fix line sent the person back to review, which printed another command that failed the same way. Accepting an older fingerprint in `approve` would need the tool store to keep each waiting version's text, a change to the approval model in `packages/core/app` and `ports`. For a server that lists a new version every time, an approved version would never be listed again anyway.

## Covers

- cli.commands.tools.review
- apps/cli/src/commands/tools/golden/review.txt
