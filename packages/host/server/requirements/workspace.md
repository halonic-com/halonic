# server.workspace

- Status: active
- Since: 0.1.0
- Source: HAL-9489, decided on HAL-9482; the phone's workspace picker on HAL-1291

The server shall answer `GET /api/workspace` behind the sign-in, like the other session routes: a request without a session gets 401 with the code `not_signed_in`. The route is read-only and answers a JSON body with exactly three keys: `name`, the workspace's name; `sample`, whether it is the sample workspace; and `folder`, the workspace's folder with the home folder written as `~`. The folder under the home folder shall be sent as `~` and the rest of its path, with `/` between the names. The home folder itself shall be sent as `~`. A folder that isn't under the home folder shall be sent as only its own name. The server shall never send an absolute path. A host that gives the server no workspace facts leaves the route out, and it then answers 404.

Rationale: `GET /api/hello` leaves the workspace's name out on purpose, because it answers without a sign-in. The served Studio, and the Android app's workspace picker, ask for the name after sign-in. An absolute path would tell a caller the account's name and the disk's layout.

## Examples

- Given the workspace "Acme" in `/people/user/Projects/acme` with the home folder `/people/user`, when a signed-in client asks `GET /api/workspace`, then it gets 200 and exactly `{ "name": "Acme", "sample": false, "folder": "~/Projects/acme" }`.
- Given the workspace in `/shared/acme`, then `folder` is `acme`.
- Given the workspace in the home folder itself, then `folder` is `~`.
- Given a Windows path under the home folder, with backslashes, then `folder` still has `~` and `/` between the names.
- Given a password is set and no session, then the route answers 401.
