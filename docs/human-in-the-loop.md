# How people stay in control of Halonic

Halonic is built with **agentic engineering**: a team of AI agents does most of the engineering work, and people stay in charge. Today the agents run on Paperclip, a tool for running agent teams; step by step we're moving that work onto Halonic itself.

**The short version:** people decide the direction, the product, the design, the money and every release. Agents write the code, tests and docs and review each other's changes, in the open. Every change is a task, a reviewed pull request, and automated checks that must pass. A person can stop, change or undo any of it at any time (see "How a person stops or overrides anything").

## Who's involved

- **The project owners** (people) set the direction and take the decisions listed below. They can step into any task at any time.
- **A coordinating agent** turns the owners' direction into tasks, collects the questions that need the owners' decision, and reports regularly on what the team did.
- **Two reviewer agents.** A technical lead reviews code and owns technical decisions. A second reviewer reviews smaller changes that touch nothing sensitive; the lead spot-checks its approvals.
- **The other agents** (engineering, design, docs, testing, release and research) each work on the tasks assigned to them.

## What only people decide

1. **Direction:** what Halonic is for, how we describe it, what goes into a release, and any change to the plan.
2. **Product and design:** new screens and flows, what users see and do, new text users read, the visual design and the brand.
3. **Money and the outside world:** spending money, creating accounts, publishing or posting anything, and installing software on the machines the agents run on.
4. **Releases:** version tags, published packages, GitHub releases, installers and deploying halonic.com. Nothing is released without the owners' explicit yes.

When an agent needs one of these decisions, it doesn't go ahead. It writes down the question, the options and a recommendation, and the request goes to the owners. Answering a question is not a yes: the work waits until the owners explicitly approve it.

## What the agents decide themselves

Technical choices, planning, code structure, code reviews and docs. Small details that build on something the owners already approved, such as a label or an error message, are also decided by the team. Every such decision is written down with its reason and reported to the owners, who can overrule it.

## How a change gets into the code

1. Every piece of work starts as a **task** with one owner, and carries one pull request.
2. The agent works on its own branch and opens a small **pull request**.
3. The **automated checks** must pass.
4. A reviewer agent **reviews** it. Security-sensitive changes, release changes and changes to the build setup always go to the technical lead. The approval is recorded on the pull request with the reviewer's name and the exact version approved; any later change needs a new approval.
5. A **merge queue** run on the owners' behalf merges approved changes. Right before merging it checks again that the change is approved, passes the checks, and fits the current main branch. Nobody merges by hand.
6. A task is **done** only when its change is merged and the checks on the merged code pass.

If the main branch starts failing in an area, the owner of that area fixes or reverts it within two hours. If it fails two nights in a row, only the fix goes into that area until it's green again.

**Releases:** before every release, the whole codebase gets a full independent review. Any serious finding still open stops the release, unless the owners sign an exception for that one finding. Releases are merged only by a named release manager, only after the owners have approved that exact version.

Pull requests from people outside the team go through the same review and checks.

## What agents may and may not do on their own

**Agents may:**

- work on tasks assigned to them;
- write code, tests and docs, and open pull requests;
- review and approve changes within their review scope;
- create tasks for each other;
- take the team decisions above, and write them down.

**Agents may not:**

- release, publish, tag or deploy anything without the owners' approval;
- spend money, create accounts or post anything publicly;
- change the product's direction, flows, screens or visual design without the owners' approval;
- merge changes by hand, or approve their own changes;
- share passwords, keys or other secrets;
- approve their own requests, or change their own permissions.

## How a person stops or overrides anything

- **Comment on a task:** the agent working on it follows the newest instruction from a person over its earlier plan, and any pending approval on that task lapses.
- **Reassign a task:** the agent stops working on it straight away.
- **Cancel a task:** no more work starts on it.
- **Pause an agent:** it starts no new work until it's resumed. Work it's doing right now can be cancelled separately.
- **Turn down an approval request:** the work stays stopped, or changes as the owners say.
- **Stop merging:** the merge queue runs on the owners' behalf and can be stopped at any time.
- **Undo a change:** every change is its own reviewed pull request, so any of them can be reverted.
- **Change the rules:** the team's working rules are written down and given to every agent each time it starts work, so a changed rule applies from then on.

## Transparency

- All work leaves a trail: tasks, comments, pull requests, reviews and check results.
- The owners get a regular update with what was done, what the team decided on its own and what's waiting for them.
- Agent commits come from a shared, clearly named account (`halonic-dev`), never from a personal one.
