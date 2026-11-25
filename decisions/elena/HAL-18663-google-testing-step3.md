# Decision: personal Google accounts stay in Testing with a test user in step 3

- Approval: the board's choice of option 1 on HAL-18554 (google-setup-flow revision 12), built on HAL-18663
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:jnoyG/SpztElSwSiIZTXgr2sGNiOiRe7p79rL2OxP8rqlEQPDorc6Jtai+1yFDcT9joNpQq784GsiMewfSSTAw==

Google keeps **Publish app** disabled until an app has a home page and a privacy policy, so most
people with a personal Google account couldn't give step 3's "In production" tick. The board
chose to keep a personal app in *Testing* instead: the user adds their own address under Test
users, step 4 (Scopes) isn't generated, so there are six steps, and the header says the sign-in
ends every 7 days. Publishing with the user's own pages stays as a folded alternative and brings
back the "In production" tick and step 4. Workspace accounts don't change.

The requirements below said that a personal app must be published, that step 4 is always there,
or listed the edits a person makes. They now say the *Testing* default, the publishing switch,
the test-user tick and its edit, and sharing an app in *Testing*. The new behaviour is in the new
requirements `google-setup.personal-testing` and `google-setup.personal-testing-step`.

## Covers

- google-setup.scopes-switch
- google-setup.setup-record
- google-setup.shared-client
- google-setup.workspace-or-personal
- server.google-setup-write
- google-setup.account-header
- google-setup.google-error-list
- google-setup.step-bodies
