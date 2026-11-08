# Standing DCO statement for agent commits

- Status: **signed**. In effect since 2026-11-08.
- Given by: Halonic
- Source: HAL-129

Halonic is built by its own AI agents. The agents commit and open pull
requests through the GitHub account listed below. An agent is not a
person and cannot certify anything, so it never adds a
`Signed-off-by:` line to a commit. Instead, Halonic gives
this statement once, for all of those commits.

## Covered accounts

| GitHub account | Commit author address                            |
| -------------- | ------------------------------------------------ |
| `halonic-dev`  | `353861737+halonic-dev@users.noreply.github.com` |

## Statement

1. Every commit whose author is a covered account, in a repository of the
   `halonic-com` GitHub organisation, is contributed on behalf of
   Halonic.
2. For each of those commits, Halonic certifies the Developer
   Certificate of Origin, version 1.1 (quoted in full below), as if the
   person signing this statement had added their own `Signed-off-by:`
   line to it. In particular, Halonic has the right to submit the
   work under the licence of the repository it is committed to.
3. Halonic directs the agents and controls the covered accounts. The
   person signing this statement vouches for those commits on its behalf.
4. Halonic understands and agrees that the project and its
   contributions are public, and that a record of each contribution and of
   this statement is kept indefinitely and may be redistributed under the
   project's licence.

## What it does not cover

- Commits by anyone else, even inside a pull request that a covered
  account opened. Those still need their author's own sign-off.
- Commits that carry a covered account's address but reach the repository
  in a pull request opened by another GitHub account. The `dco` check
  treats those as ordinary commits, so nobody can borrow the account's
  address to skip the sign-off.

## Withdrawing it

Halonic can withdraw this statement, or remove an account from it,
with a pull request that changes this file. Commits made before that
change stay covered.

## Developer Certificate of Origin 1.1

```text
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.


Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

## Signature

Signed for Halonic by its owner.

- Date: 2026-11-08

The signer's name is deliberately not written here, so that no personal
name enters the repository. Halonic keeps the signed record.
