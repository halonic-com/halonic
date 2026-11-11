# Writing docs

How we write documentation for Halonic: the docs site, package READMEs, the
community files and doc comments. Read it before you write or change a page.

## The four rules

1. **Plain language.** Write for a busy reader who doesn't know the code.
2. **One name per concept.** Use the words in the [glossary](#glossary), and
   only those.
3. **Describe only what ships.** No plans, no "coming soon", no features that
   are behind a flag or not merged yet.
4. **Only made-up content.** Examples and screenshots come from
   `examples/acme`, never from a real workspace.

## Plain language

- Short sentences. One idea per sentence, one topic per paragraph.
- Lead with what the reader wants to do, then how. "To run a workflow, …".
- Use "you" for the reader and the imperative for steps: "Open the workspace",
  not "The user should open the workspace".
- Prefer common words: "use", not "utilise"; "start", not "initiate".
- Explain a term the first time it appears, or link to the glossary.
- No hype ("blazingly fast", "seamless", "simply"). If something is easy, the
  reader will notice.
- Write numbers as digits, and give units: "3 days", "500 lines".

## Where a page goes

The docs site (`apps/docs`, not built yet: CI's `docs` job is a placeholder)
has four sections. Pick one per page; don't mix them.

| Section | Answers | Example |
| --- | --- | --- |
| Tutorials | "Teach me": a guided first experience with a sure result | Your first workflow |
| How-to guides | "How do I …?": steps for one task | Connect Gmail |
| Concepts | "Why does it work this way?" | How runs are recorded |
| Reference | "What exactly is …?": complete and dry | CLI commands, file format |

Reference pages for the CLI, the file format, the JSON Schemas and the API are
**generated from the code**. Don't edit them by hand; change the source (the
command definition, the schema, the doc comment) instead.

Guides for contributors and agents, like this one, live in `docs/guides/`.
Architecture decisions live in `docs/adr/`, one file each, named
`YYYY-MM-DD-short-title.md`.

## Docs change with the code

- A pull request that changes behaviour changes the docs in the same pull
  request. The template asks for it, and the reviewer checks it.
- Removing a feature removes its docs.
- Docs track `main`. There are no versioned docs before 1.0.

## Formatting

- Headings in sentence case: "Connect a model", not "Connect A Model".
- Use code formatting for anything the reader types or sees literally:
  commands, file names, paths, settings, IDs. `halonic validate`,
  `workspace.yaml`.
- Code blocks always name their language (` ```sh `, ` ```yaml `,
  ` ```ts `). Commands don't start with `$`, so they can be copied.
- Use relative links between docs pages, and descriptive link text: "see the
  Routines page" as the link, not "click here".
- Use a table when the reader compares things, and a numbered list for steps
  in order.
- Name UI elements as they appear, in bold: "Choose **Run**".
- Every image has alt text that says what it shows.

## Examples and screenshots

- Use the `examples/acme` workspace and its invented company, people and data.
  If you need something it doesn't have, add it there first.
- Never use real names, email addresses, workspaces, paths from your own
  machine (such as your user folder) or API keys, not even fake-looking ones. Use
  placeholders like `<your-api-key>`.
- A check scans every change for protected personal terms and for absolute
  local paths, and blocks the pull request if it finds one.
- Example code in a package README is copied from the package's `examples/`
  folder, where it is type-checked and tested. Edit the example, not the README
  copy: the `readme-examples` check fails when the copy differs from the file.

## Glossary

Use these words, with these meanings. If you need a new term, add it here in
the same pull request.

| Term | Meaning | Don't say |
| --- | --- | --- |
| **Halonic** | the whole product: Studio, engine and CLI | Halonic Studio (for the whole product), AI Studio |
| **Studio** | the Halonic app, on desktop, Android or in the browser | the UI, the client |
| **`halonic`** | the command-line tool | the `studio` command |
| **workspace** | a folder, usually a git repository, that holds a `workspace.yaml` and everything Halonic works with | project, repo (for the folder) |
| **hub** | one area of a workspace, in the `hubs/` folder, with its own agents, workflows, skills, knowledge, connectors and routines | team, space |
| **agent** | an AI model with instructions and tools, defined in a file | bot, assistant (except the built-in assistant) |
| **workflow** | a defined sequence of steps that agents and people carry out | flow, pipeline |
| **routine** | starts a workflow or an agent by itself: on a schedule, at an interval or on a trigger | job, cron |
| **run** | one execution of a workflow, recorded step by step | execution, session |
| **approval** | a step where a run waits until a person agrees | confirmation |
| **event** | what you send to a waiting run to answer it, such as `approve` or `reject` | answer (as a noun), command |
| **feature** | one part of the Studio, such as Agents or Routines, built as its own package (code term; users see the screens) | module, plugin |
| **requirement** | one recorded rule of behaviour with a stable ID, proven by tests | spec, story |
