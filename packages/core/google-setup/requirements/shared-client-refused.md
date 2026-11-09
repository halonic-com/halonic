# google-setup.shared-client-refused

- Status: active
- Since: 0.1.0
- Source: HAL-709 (build plan B4; design 4.3 and 5.2; HAL-1107, HAL-1106)

When Google refuses a token refresh with `invalid_client`, the setup records shall mark every account that uses the same client ref, in one write. The reason shall be `client`, or `client-gone` when any account on the client already held `client` or the refused account already held `client-gone`, because only the staged-secret check can refresh then, so Google refused a new secret too. A refusal that changes nothing on an account shall write nothing for it. When Google accepts a new secret for a client, the setup records shall clear a `client` refusal on every account that uses it, in one write, and keep `sign-in` and `client-gone`, which only each account's own sign-in clears.

## Examples

- Given two accounts on one client and a third on another,
  when one of the two is refused with `invalid_client`, then both hold `client` after one append and the third holds nothing.
- Given two accounts on one client, one holding `sign-in` and one holding `client`,
  when a new secret is accepted, then only the second is cleared.
- Given two accounts on one client, one holding `sign-in` and one holding `client`,
  when the staged-secret check through the first is refused with `invalid_client`, then both hold `client-gone`.
- Given accounts that hold `client-gone`,
  when a new secret is accepted, then they still hold it; when one signs in, only that one is cleared.
