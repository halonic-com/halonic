# studio.workspace-agents-sandbox-fields

- Status: draft
- Since: unreleased
- Source: HAL-18931 (T6 gap 6, the Harness page's Working folder and Allowed sites); flow-agents 5.3; the agent file's `workingFolder` and `allowedSites`

The desktop app's agents host shall give an agent's settings its `workingFolder` as the file says, or `files/agents/<id>` when the file names none, and its `allowedSites` as the file says, or none, and shall change either by editing the agent's file in place as one undoable change. It shall refuse, and write nothing, a working folder the agent file's check refuses, with that check's reason, more than 50 allowed sites, and an allowed site that isn't a host name or `*.` and a domain, with "Enter a site like registry.npmjs.org."

## Examples

- Given an agent whose file names no working folder and no sites, then its settings give `files/agents/writer` and no sites.
- Given the working folder `files/out` and the sites `registry.npmjs.org` and `*.example.com`, then the file holds them in place, its other lines stay, and the settings give them.
- Given the working folder `.git/hooks`, then the change fails with `invalid_input` and the reason names `.git`, and nothing is written.
- Given the site `localhost` or `https://example.com`, then the change fails with "Enter a site like registry.npmjs.org." and nothing is written.
- Given 51 sites, then the change fails with `invalid_input` and nothing is written.
