# integration-sign-in.sign-in-flow

- Status: active
- Since: 0.2.0
- Source: HAL-8613 (HAL-984 design, section 4, "Signing in")

The host shall start an integration's sign-in from the sign-in the sheet and the settings describe now, send the browser to an authorize URL that Halonic builds (`state`, PKCE challenge and the redirect to a new random path on `127.0.0.1` are set by Halonic and by nothing the sheet says), and finish it only from the callback of that pending sign-in. The callback shall carry the pending `state`, and a code is used once. The exchange shall use the sign-in as it was when the sign-in started, and the sign-in shall be refused if the sheet or a setting has changed since. When a grant is already saved for the sign-in, the host shall sign it out before it saves the new one: revoke at the URL that grant was approved with, then drop it. A revoke the provider doesn't confirm still drops the grant, and the outcome says so. A provider whose revoke ends every token of the client and user (the sheet says `revokeEndsClientGrants`, as Google's does) would end the new grant too, so when the old and the new approval share that client and the same token and revoke servers, the host drops the old grant without revoking it and the outcome says `skipped`; the choice is the sheet's flag, not a guess from the provider's name, and it is made from the old grant's own approval, never the sheet as it is now. A grant whose sign-in changed is refused by the tokens but is not dropped there: a setting put back makes it current again, so it is revoked and dropped when the user signs in again or signs out. The page shall never repeat what the request carried.

## Examples

- Given an approvable sign-in, then starting it gives an authorize URL with `response_type=code`, the client ID, the scopes, `code_challenge_method=S256` and a redirect to `http://127.0.0.1:<port>/sign-in/<random>`.
- Given a sheet whose `authorizeUrl` already sets `state`, `redirect_uri` or `code_challenge`, then the authorize URL carries Halonic's values.
- Given a callback with the right state and a code, then the code, the verifier and the client secret go to the approved token URL, the refresh token is saved with the approved sign-in, and the outcome is `signedIn`.
- Given the same callback twice, a wrong `state`, or a path that isn't pending, then nothing is exchanged and the answer is a plain 400.
- Given a sign-in started twice, then the first one's callback gets a 400.
- Given a sign-in that waited 10 minutes, then its callback gets a 400.
- Given an `iss` that isn't the declared issuer, or, with none declared, isn't the authorize URL's origin, then nothing is exchanged.
- Given a setting that changed after the start, then nothing is exchanged and the outcome is `signInChanged`.
- Given a token answer whose `token_type` isn't bearer, whose `access_token` is shorter than 16 characters or holds a space or line break, or that has no refresh token, then nothing is saved.
- Given a saved grant and a new sign-in that finishes, then the old refresh token is revoked at the old grant's approved revoke URL before the new grant is saved, and the outcome says `previousGrant: "revoked"`.
- Given a revoke the provider doesn't confirm, then the old grant is still dropped, the new one is saved and the outcome says `previousGrant: "notConfirmed"`.
- Given a provider whose sheet says `revokeEndsClientGrants` and a new sign-in with the same client, then no revoke is sent, the old grant is dropped, the new one is saved and the outcome says `previousGrant: "skipped"`.
- Given such a provider and a new sign-in with another client, then the old grant is revoked as usual.
- Given a new sign-in that is refused, then the old grant stays and nothing is revoked.
- Given a provider that granted other scopes than asked, then the outcome names the missing and the extra ones.
- Given a callback whose handling throws, such as a store that can't be written, then the outcome is `failed` (with the sign-in's name only), the page is a fixed 500 and a second visit gets the 400.
- Given any callback, then the page and the outcome hold no code, error description, token or client secret.
