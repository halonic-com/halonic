# google-sign-in.pkce

- Status: active
- Since: 0.1.0
- Source: HAL-699 (plan approved by Liam; security points agreed in HAL-718)

The sign-in shall make each PKCE verifier from 32 bytes of cryptographically secure randomness, written as 43 base64url characters without padding, shall derive its challenge only with the S256 method, and shall refuse a random source that gives any other number of bytes.

## Examples

- Given the verifier bytes from RFC 7636, appendix B,
  when the pair is made,
  then the verifier is `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` and the challenge is `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`.
- Given the platform's randomness,
  when two pairs are made,
  then each verifier and challenge is 43 base64url characters, the method is `S256`, and the two verifiers differ.
- Given a random source that returns 31 bytes,
  when a pair is made,
  then it fails and no verifier is made.
