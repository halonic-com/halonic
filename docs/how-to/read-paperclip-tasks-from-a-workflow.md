# Read Paperclip tasks from a workflow

If your agents work in Paperclip, a Halonic workflow can read its task board:
list the open tasks, read a task with its comments and documents, and read an
agent's inbox. It can't change anything there. A routine can use this to sum
up the week's tasks, for example.

The tools come from the `tool-paperclip-issues` integration in
`halonic-com/integrations`. You copy it into your workspace, name it in a
connector file, give Halonic a Paperclip key, and trust the workspace.

You need:

- a workspace;
- a clone of `halonic-com/integrations`, with `pnpm install` run once;
- your Paperclip server's address and your company's id;
- a Paperclip API key that can only read.

## 1. Copy the integration into your workspace

In the clone of `halonic-com/integrations`, run:

```sh
pnpm copy-to-workspace tool-paperclip-issues <your-workspace>
```

It builds the integration and puts it in your workspace's
`integrations/tool-paperclip-issues/`. Halonic runs that folder as a local
integration: its permission sheet (`integration.yaml`) lists what it may do,
and the built code in `backend/`. Run the command again to update the copy.

## 2. Add the connector file

Create `library/connectors/paperclip.connector.yaml`:

```yaml
name: Paperclip
local: true # the Paperclip server is on your own network
transport:
  integration:
    folder: tool-paperclip-issues
    settings:
      url: https://tasks.example.com
      company-id: <your-company-id>
    secrets:
      paperclip-key: paperclip-key # the workspace secret it gets, by name
tools:
  allow: [issues_list, issues_get, issues_list_comments, issues_get_document, issues_list_inbox]
  read: [issues_list, issues_get, issues_list_comments, issues_get_document, issues_list_inbox]
```

| Field | What it holds |
| --- | --- |
| `local` | `true`, so a workspace with `privacy.localOnly` may use it. The integration connects only to an address on your own network, so `halonic validate` accepts it |
| `settings.url` | your Paperclip server, over `https`. A Tailscale name or a private address works; a server on a public address is refused when the integration connects |
| `settings.company-id` | the company whose tasks the tools read |
| `secrets` | which saved secret the integration's `paperclip-key` gets. Only the name goes here, never the key |
| `tools.allow` | the 5 tools agents are offered |
| `tools.read` | the tools that run without asking first. All 5 only read, so none needs a person's OK; without this list, every call waits for one ([which connector tools ask first](choose-which-connector-tools-ask-first.md)) |

Then give an agent the connector, in its `connectors` list:

```yaml
id: board-reader
name: Board reader
description: Reads the task board and lists what changed this week.
connectors: [paperclip]
instructions: |
  List the open tasks with the paperclip tools, read the comments of the
  ones that changed this week, and write five lines on what moved.
```

Run `halonic validate` to check the files.

## 3. Save the key

```sh
halonic secret set paperclip-key
```

Type the key at the hidden prompt, or pipe it in. Never pass it as an
argument. Halonic keeps the key in your profile, outside the workspace, and
puts it in each request to your Paperclip server itself. The integration only
names it, so the key isn't in any prompt, document, run log or file in the
workspace.

## 4. Trust the workspace

```sh
halonic trust
```

The trust check lists the connector with the secret it gets, its tools, and
the address it may reach:

```text
Addresses
  paperclip     integrations/tool-paperclip-issues · gets the secret paperclip-key
                Offered tools    issues_get, issues_get_document, issues_list, issues_list_comments, issues_list_inbox
                Without asking   issues_get, issues_get_document, issues_list, issues_list_comments, issues_list_inbox
  tool-paperclip-issues   url   https://tasks.example.com/
```

Read it and answer yes. When you copy the integration again or change the
connector file, Halonic asks for `halonic trust` again before the next run.

## 5. Run it

Run the workflow whose step uses the agent, such as
`halonic run board-summary`, or let a routine start it
(`halonic routines watch`). Local integrations run in the sandbox, so run
Halonic on the computer itself; `halonic doctor` says whether the sandbox can
start.

## What it can't do

Nothing in this connector changes Paperclip:

- The integration has no tool that writes. A call to any other tool name,
  such as one that would close a task, is refused before a request is made.
- Its code sends only `GET` requests.
- A key that can only read stops a write on Paperclip's side too.

The tools, their limits and how paging works are in the integration's
README, `integrations/tools/paperclip/issues/README.md` in
`halonic-com/integrations`.
