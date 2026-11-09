# workspace.trust-changes

- Status: active
- Since: 0.1.0
- Source: HAL-188 (HAL-65 decision 9 and `workspace.trust.ask-again-on-change`; HAL-684 note 1)

The workspace package shall compare the trust content a person trusted with the current one and list the connectors that are new, changed (with the fields that differ) and removed, with how many are unchanged. It shall say that a change only removes things when whole connectors were removed and nothing was added or changed; a change inside a connector is never a removal.

## Examples

- Given a trusted workspace, when a connector `uploader` is added, then it is listed as new and the change doesn't only remove things.
- Given a trusted workspace with the connectors `files` and `mail`, when `mail` is deleted, then `mail` is listed as removed, one connector is unchanged, and the change only removes things.
- Given a trusted connector, when `NODE_OPTIONS` is added to its variables, then it is listed as changed in `settings`.
- Given a trusted connector, when a tool is taken out of `approve`, or the `allow` list is removed, then it is listed as changed in `tools` and the change doesn't only remove things.
- Given a trusted connector, when one of its variables is removed, then it is listed as changed and the change doesn't only remove things.
- Given a trusted workspace, when one connector is removed and another changes, then the change doesn't only remove things.
- Given the same content, then nothing is new, changed or removed, and the change doesn't only remove things.
