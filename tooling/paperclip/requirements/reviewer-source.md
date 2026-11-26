# paperclip.reviewer-source

- Status: active
- Since: unreleased
- Source: the board's decision of 26 Nov on HAL-18422, built on HAL-19639: the server's watcher hard-coded Liam and Julian and never woke Nora, while `pr_status` already named her

The reviewer path list shall decide who reviews a pull request on `halonic` in one place, `reviewer-paths-who.ts` on top of `paperclip.reviewer-routing`: the reviewer of its paths, never its author (Liam's own go to Julian, Julian's to Liam, Nora's own to Julian at the least). `pr_status`, the PR watcher's handoff, `review_verdict` and the Merger's gate report shall take the reviewer from there. `cli/reviewer.ts` shall print the same answer as JSON (`repo`, `number`, `head`, `author`, `reviewer`, `role`, `routineRefusal`) for one pull request read from GitHub, so a tool that can't import the package, such as the server's watcher, uses it instead of a list of its own. A test shall fail when a source file of this package outside `routing.ts` and the `reviewer-paths` files decides a reviewer from reviewers' names (a comparison that picks one, or a list of two or more of them), except the files it names, each with the reason it may.

## Examples

- Given a 120-line Studio change on `ravi/HAL-1-acme`, when the command reads it, then it prints `"reviewer":"nora"`, `"role":"routine-reviewer"` and `"routineRefusal":null`.
- Given the same change on `nora/HAL-1-acme`, then the reviewer is `julian`; on `liam/HAL-1-acme`, `julian`; on `julian/HAL-1-acme`, `liam`.
- Given a change to the root `package.json` on `ravi/HAL-1-acme`, then the reviewer is `liam`.
- Given a new file with `branch === "liam" ? "Julian" : "Liam"`, when the package's tests run, then the source test fails and names that file and line.
