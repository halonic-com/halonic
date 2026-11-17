# google-setup.client-id-shape

- Status: active
- Since: unreleased
- Source: HAL-713 (design 5.1; UX checklist section 3.1)

When text is one or more digits, a hyphen, one or more lower-case letters or digits and then `.apps.googleusercontent.com`, `isClientId` shall return true; otherwise it shall return false. The setup record shall accept a `clientId` only when `isClientId` returns true for it.

## Examples

- Given `1234-abc.apps.googleusercontent.com`, then it returns true.
- Given a client secret such as `GOCSPX-abc123`, then it returns false.
- Given a client ID with a space in it, with capital letters, or without the ending, then it returns false.
