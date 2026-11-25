# The Studio Assistant

The Assistant is the chat in Studio that helps you build and change your
workspace. You describe what you want; it reads your files and proposes
changes for you to review. Nothing it writes counts until you accept it.

This page describes what ships on `main`.

## Open the Assistant

- **On a computer:** choose **Assistant** in the title bar, or press
  `Ctrl+Alt+I`. The Assistant opens as a side panel next to the page you're
  on.
- **On a phone:** tap the Assistant's orb next to Search at the top of Home,
  Inbox, Runs or More. The Assistant opens as a full page; **Back** returns
  to where you were. Under its name it says which page you came from, such as
  "Looking at: Home".
- **From an item:** choose **Show in chat** in the ⋮ of an agent or a
  workflow, or Alt-click (⌥-click on a Mac) its row in the overview. The item
  shows as a chip under the status line, and the Assistant knows it's shown.
- **From a skill or a new workflow:** **Ask about this skill** opens the
  Assistant with "What should change in <name>?" in the box. In **New
  workflow**, the **Describe** link opens it too.

## Chats

- The panel's title opens your recent chats. Its ⋮ menu renames or deletes
  the chat shown. On a phone, the ⋮ holds **New chat**, **Recent chats**,
  **Rename** and **Delete chat**.
- A chat can open as a tab, with a side panel for the items it shows.
  **Continue** in the side panel moves it back.
- Chats are kept when you close Studio, up to the 40 most recently used.
- **Chat with** picks who answers: the Build chat, or one of your agents.
  Each agent shows as its own coloured orb, with what it's doing
  ("thinking…", "replying…"). Changing it starts a new chat and keeps the old
  one.
- **Model** picks the model for one chat. A model you can't use yet is listed
  with its reason, such as "Needs a key for Anthropic".
- Replies show bold, code and lists, not Markdown characters. In Try it, an
  agent's reply shows as it is written.

### Chat beside an item

An agent's page shows its **Try it** chat on the left, beside Flow,
Configuration and Runs, so you can try the agent while you change it.

A workflow's page has a chat about that workflow. It says "About: <name>",
lists only the chats about that workflow, can open as a tab from its ⋮, and
starts with "What should change in <name>?".

## What the Build chat can do

The Build chat reads your workspace's files and proposes changes to them. It
can:

- read files, check them against the schema, and validate the workspace,
  local integrations included;
- write or delete files, as changes for you to review;
- in a trusted workspace, show you a run, an agent or a workflow while you
  keep typing. The chat says, for example, "Showed run r42";
- write an integration. It first offers a built-in one that fits, then asks
  only for the service's address, its tools and how it signs in;
- in a trusted workspace, read a service's public docs page while it writes
  an integration, once you allow that site.

It follows your workspace's own `halonic-authoring` skill. **customize skill**
under the box writes the built-in skill into your library for you to edit.

## What it asks you for

The Assistant never changes your workspace on its own. It asks you:

- **To accept each change.** Each change shows as a card with **Review**,
  **Accept all** and **Reject all**, and a toast with **Undo** after each
  decision. When changes wait in 2 or more items, a strip above the box says,
  for example, "3 items to review", with **Accept all** and **Reject all** for
  the whole chat. On a phone, **See what changes** opens the diff. A card
  says how the change ended: Accepted, Accepted 2 of 3, Rejected or Replaced
  by a newer change. If the file changed outside Halonic, the card waits for
  **Compare**.
- **To allow a docs site.** Before it reads a public docs page, the chat
  shows a card for that site. Your answer holds for that chat only.
- **To trust the workspace.** In a workspace you haven't trusted yet, the
  Assistant answers on your Settings › Assistant model with its authoring
  tools only, under the line "Not trusted yet · it can read and propose, but
  not run anything." with **Review**.
- **For a new skill.** The Build chat follows a `halonic-authoring` skill it
  proposed only after you accept it.

## Limits

- It never asks for a key in the chat, and holds back a message that looks
  like an API key.
- It never reads, lists or changes common credential files, such as `.npmrc`,
  `.netrc`, `.git-credentials`, SSH keys, `.pem` and `.key` files,
  `.aws/credentials` and anything in a `.ssh` or `.gnupg` folder.
- An integration's permission sheet or connector gets only the hosts and
  sign-ins you named in your own messages in that chat. The trust check marks
  any address the Assistant added that you didn't name with "added by the
  assistant".
- One answer at a time per chat.
- It needs a model. Under the box it says when the chat has no model, needs
  an API key, or can't use a cloud model in a local-only workspace. When it
  can't reach its model, it says what to do, with **Open Models**.
- It answers on Halonic's engine. If the engine stops mid-answer, the chat
  says so, and offers **Try again** when no tool ran yet. On a phone, the
  buttons wait with "Waiting for Halonic on your computer." while it isn't
  answering.
- Studio on macOS and Linux is in progress, so on a computer the Assistant is
  Windows only for now.
