# Get updates for files Halonic leaves to git

Halonic never writes some files in a workspace: private files such as
`.env.example`, and names with `:` or with `~` and a digit. When the shared
copy changed one of them, **Get updates** on the Changes page refuses and
names the files, so that it doesn't keep your copy and take your teammate's
change back for everyone. Nothing in your workspace changes. **Show how** on
that message opens this page.

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

## Where the updates come from

`git pull` gets them from the same shared copy that Get updates uses: the one
your workspace's branch follows. Get updates reached that copy before it
refused, so there's nothing to set up first.

## If you don't use a terminal

Studio already uses the git installed on this computer, so you have it. To open
a terminal in the workspace folder:

- **Windows:** open the folder in File Explorer, right-click an empty spot and
  choose **Open Git Bash here**, which comes with Git for Windows (on
  Windows 11 it's under **Show more options**).
- **macOS:** open **Terminal** from Applications, Utilities, type `cd `, drag
  the folder onto the window and press Return.
- **Linux:** open the folder in your file manager and choose
  **Open in Terminal**, or open a terminal and `cd` to it.

A git app works too: open the workspace folder in it and pull. If it asks how
to combine the changes, choose merge, not rebase.
