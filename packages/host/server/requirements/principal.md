# server.principal

- Status: active
- Since: unreleased
- Source: HAL-13213; selling layer design (HAL-12483), sections 3.1, 3.2, 13.1, 13.2 and 16.2; threat model (HAL-13208)

The server shall build a principal, the signed-in end user (`actor`), the scope the session works in and the actor's role there, only from a session's claims that pass one shared check, or from a stored principal record that passes the same check, and never from a request body, a path or a storage name. The check shall refuse claims unless the audience is exactly the text `app`; the end-user id matches `^eu_[A-Za-z0-9]{16,40}$`; the scope is `u/` followed by an end-user id or `o/` followed by an organisation id matching `^org_[A-Za-z0-9]{16,40}$`, with nothing before, after or encoded; a `u/` scope names the actor's own id, with the role `owner` or no role; and an `o/` scope has the role `owner`, `admin` or `member`. The `client` claim, when present, shall be text, and shall be kept beside the principal, never in it. The name prefix a scope gives a runtime shall always end in `/`.

Rationale: a principal decides whose data a request reaches, so it must never come from what the client sends, and two scopes must never share a name prefix.

## Examples

- Given an end-user id `a` with object `b/x` and an id `a/b` with object `x`, then no two scopes give the same prefix, because `a/b` is not a valid id.
- Given a token for one end user whose scope is another end user's `u/` scope, then it is refused.
- Given an organisation scope with no role, then it is refused.
- Given two tokens that differ only in `client`, then their principals are equal.
- Given a principal stored with a run, then reading the record back gives an equal principal, and an edited record that breaks a rule gives none.
