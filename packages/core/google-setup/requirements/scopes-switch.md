# google-setup.scopes-switch

- Status: active
- Since: 0.1.0
- Source: HAL-707 (build plan B2, decision D4; design 3.2)

When `listScopes` is false, `setupSteps` shall leave out step 4 and number the other steps 1 to 6, keeping their ids, and step 7 shall still carry every scope Google has to grant. When `listScopes` is missing, step 4 shall be there.

## Examples

- Given `listScopes: false`, then the steps are `project`, `apis`, `consent`, `client`, `credentials`, `sign-in`, numbered 1 to 6.
- Given `listScopes: false` and one service, then step 7 still lists its scope.
