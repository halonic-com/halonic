# studio.commands-name-folder

- Status: active
- Since: unreleased
- Source: HAL-12725 (first-run check F7, L1, D1 on HAL-12721 and HAL-12714; D-A on HAL-12822; D-A2 on HAL-12847); HAL-14649

When the desktop app opens a folder, every `halonic` command it shows to copy shall name that folder with `--dir` and its absolute path, built as `app.halonic-command` builds it, so the command works from a new terminal: the Inbox's command to answer a run, the workflow page's "Start it from a terminal:", the `halonic run` line on Home and in the Runs list, the Tests page's command to run the tests, and the `halonic tools review` command on the page of an MCP server over HTTP. Where `app.halonic-command` gives no command, the app shall show none.

When the open folder is a Windows folder, the app shall show no command that starts a run and shall not say that runs started from the command line show up here (D-A2): a run started in WSL 2 lands in the Linux profile, and Studio lists the runs of the Windows profile. Home shall say only "Studio shows what your agents are doing and lets you read each run.", or, with no workflow, "This workspace has no workflows yet. Add one in Workflows."; the Runs list shall show "No runs yet" with no line under it, or, with no workflow, "This workspace has no workflow yet: add one in Workflows."; where a workflow's page has **Run** (`runs.list`, HAL-12371), the Runs list shall keep the sentence that says to press it and drop "Runs started from the command line show up here too."; and the workflow page shall show no "Start it from a terminal:". Nor shall the page of an MCP server over HTTP show a `halonic tools review` command: the CLI in WSL 2 keeps its approvals in the Linux profile, and Studio reads those of the Windows profile. The Tests page's command stays, since test results stay in the terminal.

When the open folder is a Windows folder, the Inbox shall refuse an answer with "Studio can't answer runs yet." alone, with no command and no **Try again**: the CLI runs in WSL 2 and can't see the runs Studio keeps in the Windows profile.

## Examples

- Given the folder `/acme/Documents/Acme sample` and run 6ab5ad waiting,
  when you press Approve,
  then the command to copy is `halonic runs send --dir "/acme/Documents/Acme sample" 6ab5ad approve`.
- Given that folder and the workflow `reply`,
  then its page shows `halonic run --dir "/acme/Documents/Acme sample" reply`.
- Given that folder with no runs yet,
  then Home and the Runs list say to type `halonic run --dir "/acme/Documents/Acme sample" support-reply`.
- Given the folder `Acme sample` in `Acme` on drive D and the workflow `reply` in the hub `acme`,
  then its page shows no command to start it, the Tests page shows `halonic test --dir "/mnt/<drive>/Acme/Acme sample" --filter acme/reply/`, with `d` for `<drive>`,
  the Runs list says only "No runs yet",
  and when you press Approve on a waiting run, the Inbox says "Studio can't answer runs yet." with no command.
- Given the folder `/acme/Documents/Acme sample` and the MCP server over HTTP `notes-mcp`,
  then its page shows `halonic tools review --dir "/acme/Documents/Acme sample" notes-mcp`.
- Given the folder `\\acme\Acme sample`, then the workflow page shows no command to start it.
