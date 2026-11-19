# Decision: the plugin trust check's file list is headed "Files"

- Approval: Paperclip task HAL-12638 (Nina's C54 docs check on HAL-12634, item P20)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:JkCN+dNzOXbxKop9+BInlg2v4NoGzmSC6ZYtEocRYxuV8QMEvowKtQgpDg8G2S7PzR4tI9Tch/gk0afalE6RCw==

The requirement `app.plugin-trust-sections` named the heading of the file list "Backend files". Nina's
docs check (HAL-12634, P20) found it listing `tools/server.js` for a plugin with no backend: a program's
files are in the list too, so the heading said something untrue. The heading is now "Files", in
`halonic plugin add` and in Studio's trust check alike, since both read it from the shared model. The
CLI's line under the fingerprint says "Covers the manifest and the files above." to match.

Only the heading's word changes. Which files are listed, the cap of ten, "and N more" and the escaping
are the same; no example is removed. The tests that named "Backend files" now name "Files".

## Covers

- app.plugin-trust-sections
