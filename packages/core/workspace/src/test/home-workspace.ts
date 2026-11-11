import { MemorySource } from "./memory-source.ts";

/**
 * A made-up home workspace with two hubs that share it, as in the old
 * `studio extract` test: `family` names shared items from its agents and
 * routines and has no `uses`; `investing` lists only the bank in `uses`.
 */
export const homeFiles: Record<string, string> = {
  "workspace.yaml": [
    "# Our home, made up for this test.",
    "id: home",
    "name: Home",
    "description: Everything at home.",
    "privacy:",
    "  localOnly: true",
    "",
  ].join("\n"),
  "models.yaml": "aliases:\n  default:\n    provider: mock\n    model: echo\n",
  "providers/mock.yaml": "id: mock\nname: Mock\ntype: mock\nlocal: true\n",
  "runtimes/inprocess.yaml": "id: inprocess\ntype: inprocess\n",
  "deployments.yaml": "deployments:\n  laptop:\n    name: Laptop\n    host: local\n",
  ".gitignore": ".env\nnode_modules/\n",
  "README.md": "About our home.\n",
  "library/connectors/mailbox.connector.yaml":
    "name: Mailbox\ntransport:\n  google:\n    account: family@example.com\n",
  "library/connectors/bank.connector.yaml":
    "name: Bank\ntransport:\n  http:\n    url: https://bank.example.com/mcp\n",
  "library/skills/tone/SKILL.md": "---\nname: Tone\ndescription: Kind and short.\n---\nBe kind.\n",
  "library/skills/tone/examples.md": "Thanks, that helps.\n",
  "library/skills/unused/SKILL.md": "---\nname: Unused\ndescription: Nobody uses it.\n---\nNo.\n",
  "library/knowledge/notes.yaml": "id: notes\nprovider: files\nconfig:\n  path: docs/notes\n",
  "docs/notes/recipes.md": "Pancakes.\n",
  "docs/other.md": "Not a note.\n",
  "library/collections/chores.collection.yaml": [
    "id: chores",
    "name: Chores",
    "fields:",
    "  task: { type: text }",
    "  who: { type: ref, collection: people }",
    "",
  ].join("\n"),
  "library/collections/people.collection.yaml":
    "id: people\nname: People\nfields:\n  name: { type: text }\n",
  "workflows/routines/morning-mail.routine.yaml": [
    "id: morning-mail",
    "name: Morning mail",
    "trigger:",
    "  mail:",
    "    connector: mailbox",
    "run:",
    "  hub: family",
    "  agent: helper",
    "  prompt: Sort the new mail.",
    "",
  ].join("\n"),
  "hubs/family/hub.yaml": "id: family\nname: Family affairs\ndescription: Chores and meals.\n",
  "hubs/family/README.md": "The family hub.\n",
  "hubs/family/agents/helper.agent.yaml": [
    "id: helper",
    "name: Helper",
    "model: default",
    "instructions: Help out.",
    "skills: [tone]",
    "knowledge: [notes]",
    "collections: [chores]",
    "",
  ].join("\n"),
  "hubs/investing/hub.yaml": "id: investing\nname: Investing\nuses:\n  connectors: [bank]\n",
  "hubs/investing/agents/advisor.agent.yaml":
    "id: advisor\nname: Advisor\nmodel: default\ninstructions: Advise.\nconnectors: [bank]\n",
};

/** The home workspace as a source, with `extra` files added or replaced. */
export const home = (extra: Record<string, string> = {}) =>
  new MemorySource({ ...homeFiles, ...extra });
