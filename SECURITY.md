# Security policy

Thank you for helping keep Halonic and its users safe. Please report security
problems privately, never in a public issue, discussion or pull request.

## How to report

Use either of these:

- **GitHub private vulnerability reporting.** Open the **Security** tab of this
  repository and choose **Report a vulnerability**. This is the preferred way:
  the report, our questions and the fix stay together in one private advisory.
- **Email** [security@halonic.com](mailto:security@halonic.com).

Please include:

- what an attacker can do, and what they need first (for example network
  access to `halonic serve`, or a workspace the user opens)
- the Halonic version or commit, and your operating system
- the steps to reproduce it, ideally with a small made-up workspace
- any idea you have for a fix

Never send real credentials, API keys or personal data in a report. If you
found a secret, tell us where it is, not what it is.

If you used an AI tool to find or describe the problem, check the finding
yourself before you send it, and say which tool you used. We don't act on
reports nobody has checked.

## What happens next

- We confirm that we received your report, usually within three working days.
- We investigate, keep you informed, and agree a disclosure date with you. We
  aim to fix serious problems within 90 days.
- We publish a GitHub security advisory with the fix and credit you, unless you
  prefer not to be named.

Please give us a fair chance to fix the problem before you talk about it in
public.

## Supported versions

Halonic is before version 1.0. We fix security problems in the **latest
release** only, and on the `main` branch. Please update to the latest release
before you report a problem, and check that it is still there.

## Scope

In scope is everything in this repository: the Studio app, the engine, the
`halonic` command-line tool, `halonic serve`, the adapters and the release
builds.

Some things are by design and are not security bugs on their own:

- A workspace you have marked as trusted can start programs, such as local MCP
  servers. Only trust workspaces from people you trust. A way to run code from
  a workspace you have **not** trusted is a security bug.
- Model output is untrusted input. A way for model output to do something you
  didn't approve is a security bug.

What Halonic protects, from whom, and which mitigations exist today are in the
[threat model](docs/security/threat-model.md).

Problems in a third-party dependency are best reported to that project. Tell us
too if Halonic is affected, so we can update.
