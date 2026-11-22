# Get updates for files Halonic leaves to git

Halonic never writes some files in a workspace: private files such as
`.env.example`, and names with `:` or with `~` and a digit. When the shared
copy changed one of them, **Get updates** on the Changes page refuses and
names the files, so that it doesn't keep your copy and take your teammate's
change back for everyone. Nothing in your workspace changes.

Get these updates with git instead:

1. Open a terminal in your workspace folder, the one with `workspace.yaml`.
2. Run:

   ```sh
   git pull --no-rebase
   ```

3. If git reports conflicts, open each file it names, keep the lines you want,
   then run `git add <file>` for each one and `git commit`.
4. Go back to Studio. The Changes page shows the updates as part of your
   history, and Get updates works as usual again.
