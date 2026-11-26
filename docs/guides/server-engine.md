# Server engine runbook

How to run `halonic serve` as a service on the server that runs Paperclip, so
routines with no model run there on a schedule. Only the board's server session
follows this runbook on the server. Authors write and review it; they never
deploy.

This is part 1: the server engine listens on `127.0.0.1` only. There is no
proxy site and no public hostname, so nothing outside the server can reach it.
[Part 2](server-engine-public.md) opens it to the board's desktops under a
public name.

The design is in the [agent messaging ADR](../adr/2026-11-24-agent-messaging.md),
section (b). The rules the server follows are in
[`server.routines`](../../packages/host/server/requirements/routines.md),
[`server.host-check`](../../packages/host/server/requirements/host-check.md) and
[`server.paperclip-key-store`](../../packages/host/server/requirements/paperclip-key-store.md).
The checks on this page are in
[`cli.commands.serve.loopback-runbook`](../../apps/cli/src/commands/serve/requirements/loopback-runbook.md).

## What you set up

| What | Where |
| --- | --- |
| Service user | `halonic-engine`, home `/srv/halonic-engine`, no login shell |
| Checkout of `halonic` | `/srv/halonic-engine/halonic`, pinned to one `main` commit |
| Engine workspace | `/srv/halonic-engine/workspace`, with the routines, and no key |
| Profile folder | `/srv/halonic-engine/.local/share/halonic`: the sign-in password, the Paperclip keys the sign-in stores, runs, cache |
| Service | `halonic-engine.service`, listening on `127.0.0.1:4747` |

The profile folder is outside the checkout, so a deploy or a rollback never
touches the password, the runs or the cache.

## Part 1: set up the service

### 1. Check the port and pnpm

Pick a free port. The examples use `4747`, the `serve` default:

```sh
ss -ltn 'sport = :4747'
command -v pnpm
```

The first command must list no listener. The second prints the path to `pnpm`
that goes in the unit's `ExecStart`.

### 2. Make the service user and its folders

```sh
sudo useradd --system --home-dir /srv/halonic-engine --create-home --shell /usr/sbin/nologin halonic-engine
sudo chmod 0700 /srv/halonic-engine
sudo -u halonic-engine git clone https://github.com/halonic-com/halonic.git /srv/halonic-engine/halonic
sudo -u halonic-engine mkdir -m 0700 /srv/halonic-engine/workspace
```

### 3. Pin a commit and install

Pick a `main` commit whose `ci-ok` is green, then install as the service user.
The install fetches the Node version the repo pins, so the service needs no
network at start. The home folder is `0700`, so you can't `cd` into it; every
command names the checkout instead:

```sh
sudo -u halonic-engine git -C /srv/halonic-engine/halonic fetch origin main
sudo -u halonic-engine git -C /srv/halonic-engine/halonic checkout --detach <commit>
sudo -u halonic-engine pnpm --dir /srv/halonic-engine/halonic install --frozen-lockfile
echo "$(date -u +%FT%TZ) <commit>" | sudo -u halonic-engine tee -a /srv/halonic-engine/deployed.log
```

`deployed.log` is the list of commits you deployed, newest last, for a
rollback.

The steps below run the CLI as the service user, from the checkout. To save
typing, define this for your shell session:

```sh
engine() { sudo -u halonic-engine -H sh -c 'cd /srv/halonic-engine/halonic && exec pnpm exec node apps/cli/bin/halonic.js "$@"' engine "$@"; }
```

### 4. Set the sign-in password

```sh
engine secret set serve-password
```

Type the password at the hidden prompt. Never pipe it in or put it on the
command line, where it would stay in your shell's history. Keep it in the
board's password manager. The routes that change something need it, and so do
`halonic serve pair` and `halonic serve devices`.

### 5. Write the test routine

The test routine runs every 5 minutes and starts a workflow with one `rule`
step and no model. Make these 5 files in `/srv/halonic-engine/workspace`, owned
by `halonic-engine`. First make their folders as that user:

```sh
sudo -u halonic-engine mkdir -p /srv/halonic-engine/workspace/hubs/checks/rules /srv/halonic-engine/workspace/hubs/checks/workflows/routines
```

Then write each file as that user too, so it gets the right owner: run
`sudo -u halonic-engine tee <file> > /dev/null` with the file's full path,
paste its content, and press Ctrl-D. For the first one:

```sh
sudo -u halonic-engine tee /srv/halonic-engine/workspace/workspace.yaml > /dev/null
```

`workspace.yaml`:

```yaml
id: server-engine
name: Server engine
description: Routines that run on the server, with no model.
privacy:
  localOnly: true
```

`hubs/checks/hub.yaml`:

```yaml
id: checks
name: Checks
description: Checks that the server engine runs its routines.
```

`hubs/checks/rules/count.rule.js`:

```js
export function run(ctx) {
  return { count: ctx.input.items.length };
}
```

`hubs/checks/workflows/serve-check.workflow.yaml`:

```yaml
id: serve-check
name: Serve check
description: Counts three items with a rule, with no model.
initial: count
context: { items: [1, 2, 3] }
states:
  count:
    type: rule
    rule: rules/count.rule.js
    input: { items: "{{context.items}}" }
    output: counted
    on:
      - to: done
  done:
    type: final
```

`hubs/checks/workflows/routines/serve-check.routine.yaml`:

```yaml
name: Serve check
description: Every 5 minutes, checks that the server engine runs routines.
trigger:
  schedule: "*/5 * * * *"
run:
  workflow: serve-check
```

Then check the workspace and trust it:

```sh
engine validate --dir /srv/halonic-engine/workspace
engine trust --dir /srv/halonic-engine/workspace
```

`validate` ends with `No problems.` `trust` usually asks for a yes at a prompt.
This workspace reaches no model, so `trust` says `Server engine needs no trust`,
asks nothing and saves nothing: there is nothing to answer. When you add a
routine that reaches a model, a connector or Paperclip, `trust` lists what it
may reach and asks: read that list before you answer yes.

### 6. Install the unit

Write `/etc/systemd/system/halonic-engine.service`. Replace the `pnpm` path with
the one step 1 printed:

```ini
[Unit]
Description=Halonic server engine, loopback only
After=network.target

[Service]
Type=simple
User=halonic-engine
Group=halonic-engine
WorkingDirectory=/srv/halonic-engine/halonic
ExecStart=/usr/local/bin/pnpm exec node apps/cli/bin/halonic.js serve --dir /srv/halonic-engine/workspace --port 4747
SuccessExitStatus=143
Restart=on-failure
RestartSec=10
TimeoutStopSec=30
UMask=0077
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/srv/halonic-engine
IPAddressDeny=any
IPAddressAllow=localhost

[Install]
WantedBy=multi-user.target
```

What the settings do:

- `serve` without `--network` or `--public-origin` listens on `127.0.0.1` only.
- `IPAddressDeny=any` with `IPAddressAllow=localhost` drops all traffic that
  isn't loopback, both ways. So even a wrong `serve` option can't open the port
  to the network, and a routine can't call out.
- `SuccessExitStatus=143`: `serve` exits with 143 when systemd stops it, which
  is a normal stop.
- The unit holds no secret and no `Environment` line for one.

Start it:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now halonic-engine
journalctl -u halonic-engine -n 20
```

The log shows `Serving Server engine at http://localhost:4747`. The line that
says the Studio page isn't built is expected: the server engine needs no page.
After that, every finished request gets one line with its method, path and
status, such as `POST /api/pair 401` for a wrong pairing code and
`POST /api/pair 429` once a caller has tried too often. The log never holds a
query, a header or a body, so no code, pending ID or token appears in it.

### 7. Check it

1. It runs as its own user:

   ```sh
   ps -o user= -p "$(systemctl show -p MainPID --value halonic-engine)"
   ```

   This prints `halonic-engine`.

2. It answers on loopback:

   ```sh
   curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4747/api/hello
   ```

   This prints `200`.

3. It listens on loopback only:

   ```sh
   ss -ltn 'sport = :4747'
   ```

   The only local address is `127.0.0.1:4747`.

4. Nothing outside answers. From a computer that isn't the server:

   ```sh
   curl -m 5 http://<server address>:4747/api/hello
   ```

   This fails with a timeout or "connection refused", never with an answer.

5. The routine runs. Wait 10 minutes, then:

   ```sh
   engine runs --workflow serve-check --dir /srv/halonic-engine/workspace
   ```

   This lists at least 2 runs of `serve-check`, completed.

## The Paperclip key

The test routine needs no Paperclip key, and part 1 adds none. A routine that
reaches Paperclip uses the key of one of the engine workspace's connection
files, `connections/paperclip/<connection>.yaml`. The owner signs in to that
connection on the server (`server.paperclip-sign-in`), the board approves it
in Paperclip, and the server stores the key in the profile's own secret store
as `halonic_token_paperclip-<connection>` (`server.paperclip-key-store`). That
secrets file in the profile folder is the only place the key is kept: it never
passes through a file you write, the unit, an environment variable or the
engine workspace, and no device ever holds it. Don't put it in any of them by
hand: the server reads it only from the record the sign-in stores.

### Sign in to a connection

The connection file must be in the engine workspace and `serve` must be
running. Its `address` is where the server reaches Paperclip: the unit allows
loopback traffic only, so use Paperclip's address on the server itself, such
as `http://127.0.0.1:<Paperclip port>`.

Studio paired with the server keeps no key, and this version of Studio doesn't
start the server's sign-in yet. Sign in from a shell on the server, on
loopback, with a password session. Both the sign-in and the session need the
`serve-password`; `read -rs` takes it at a hidden prompt and `jq` builds the
request from standard input, so it is never on a command line. The session
cookie goes into a private file that you delete at the end:

```sh
jar="$(mktemp)"
api() { curl -s -b "$jar" -c "$jar" -H 'Content-Type: application/json' --data @- "http://127.0.0.1:4747/api/$1"; echo; }
read -rsp 'serve-password: ' pw; echo
printf '%s' "$pw" | jq -Rs '{password: .}' | api login
printf '%s' "$pw" | jq -Rs '{password: ., connection: "<connection>", address: "<connection address>"}' | api paperclip-keys/sign-in/start
unset pw
```

`login` answers `{"signedIn":true}`. `sign-in/start` answers a `signInId`, a
`phrase`, an `approvalUrl` and an `expiresAt` ten minutes on. The
`approvalUrl` is on the connection file's own address, such as
`http://127.0.0.1:<Paperclip port>/cli-auth/…`, which the board's computer
can't open. The board opens the same path and query on Paperclip's usual
address, and approves only when Paperclip shows the same phrase.

`sign-in/start` can also answer `refused`, with a reason:
`address-not-allowed` (no connection file has that address),
`unreachable` (Paperclip doesn't answer at that address) or
`too-many-sign-ins` (cancel or wait out an open one). Fix that and start again.

Poll until the answer isn't `pending`; the poll takes no password:

```sh
jq -n --arg id '<signInId>' '{signInId: $id}' | api paperclip-keys/sign-in/poll
```

The answers:

- `pending`: the board hasn't approved yet. Poll again.
- `connected`, with the connection's name, address and company, never the
  key. `halonic serve devices` lists "Paperclip key for <connection>
  connected", made by `browser`.
- `wrong-company`: the board user doesn't belong to the connection file's
  company. The server stored nothing.
- `expired`: nobody approved within ten minutes. Start again.
- `unknown`: the server no longer knows that sign-in, for example after a
  restart. Start again, and the board doesn't approve the old one.

When an answer carries `keyMayWork: true` (with `wrong-company`, `expired` or
`cancelled`), the server couldn't revoke the key Paperclip made, so it may
still work: the board revokes it in Paperclip. The service's log says why
(`server.paperclip-sign-in-failures`).

Once the answer isn't `pending`, end the password session, then delete the
cookie:

```sh
api logout < /dev/null
rm -f "$jar"
```

To remove a stored key, sign in to the server again and send Disconnect. It
revokes the key at Paperclip, then deletes the record and the connection's
messaging cache:

```sh
jar="$(mktemp)"
read -rsp 'serve-password: ' pw; echo
printf '%s' "$pw" | jq -Rs '{password: .}' | api login
printf '%s' "$pw" | jq -Rs '{password: ., connection: "<connection>"}' | api paperclip-keys/disconnect
unset pw
api logout < /dev/null
rm -f "$jar"
```

When it answers `revoked: false`, Paperclip didn't revoke the key: the record
is gone from the server, but the key may still work until it expires, so the
board revokes it in Paperclip.

## Pair Studio with the server

A desktop Studio reads a workspace's Inbox and Messenger from the server once
it is paired (`connections.engine-row`, `connections.server-pair-dialog`):

1. On the server, run `halonic serve pair`. It shows the server's address and
   an 8-symbol pairing code, valid for 10 minutes.
2. In Studio, open Settings › Connections and pick **Server** under
   **Messaging engine**. Enter the address, the code and a name for this
   computer, and press **Continue**.
3. Studio shows a check code. Allow the request on the server only if it shows
   the same check code next to that name.

The setting moves to **Server** only once the server allowed it and the
keychain holds the pairing; Studio never sees the device token. Picking
**This computer** again asks first, ends the pairing on the server and deletes
it from the keychain. If the server couldn't be reached then, remove the
computer with `halonic serve devices`. Studio needs the desktop keychain for
this: without it, **Server** can't be picked.

## Run the PR watcher hub

The PR watcher hub (`hubs/pr-watcher` in `workspace-company`, HAL-17974) runs
a pass every 10 minutes next to today's watcher, as a dry run: it reads the
Agent tools plugin's last pass through the `paperclip` connector, decides the
dones and wakes with rules and no model, and checks them against what today's
watcher wrote. Its connector allows only the `pr-watcher-pass` read, so no run
wakes anyone or marks a task done.

1. Deploy a `halonic` commit that holds the `paperclip` connector
   (`cli.serve-paperclip-tools`, HAL-19721): `8ba9e8e` or later, with a green
   `ci-ok`. Follow [Deploy a new commit](#deploy-a-new-commit). Check it:

   ```sh
   sudo -u halonic-engine git -C /srv/halonic-engine/halonic merge-base --is-ancestor 8ba9e8e HEAD && echo ok
   ```

   This prints `ok`.

2. Copy the hub from a `workspace-company` checkout at `8b46a78` or later into
   the engine workspace, owned by `halonic-engine`:

   ```sh
   sudo cp -rT <workspace-company checkout>/hubs/pr-watcher /srv/halonic-engine/workspace/hubs/pr-watcher
   sudo chown -R halonic-engine:halonic-engine /srv/halonic-engine/workspace/hubs/pr-watcher
   ```

   The engine workspace is `localOnly`, so every connector in it must be
   `local: true`. The hub's `library/connectors/paperclip.connector.yaml` is,
   because Paperclip runs on this server; don't change that.

3. Add the `halonic` connection, which the connector names. Make its folder,
   then write the file as in step 5 of part 1:

   ```sh
   sudo -u halonic-engine mkdir -p /srv/halonic-engine/workspace/connections/paperclip
   sudo -u halonic-engine tee /srv/halonic-engine/workspace/connections/paperclip/halonic.yaml > /dev/null
   ```

   `connections/paperclip/halonic.yaml`, with Paperclip's loopback address and
   the company's ID:

   ```yaml
   label: Halonic
   address: http://127.0.0.1:<Paperclip port>
   company: <company id>
   ```

   The file holds no key: it may hold only these three fields.

4. Check and trust the workspace:

   ```sh
   engine validate --dir /srv/halonic-engine/workspace
   engine trust --dir /srv/halonic-engine/workspace
   ```

   `validate` ends with `No problems.` This time `trust` lists what the
   workspace may reach and asks: answer yes only if it reaches Paperclip
   through the `paperclip` connector and nothing else.

5. Restart, so `serve` reads the new hub, connection and trust:

   ```sh
   sudo systemctl restart halonic-engine
   ```

6. Sign in to `halonic` as in [Sign in to a connection](#sign-in-to-a-connection),
   with `"connection": "halonic"` and the file's address. Until then, each run
   fails at its first step with `signed-out` and sends nothing to Paperclip.

7. Wait 20 minutes, then:

   ```sh
   engine runs --workflow pr-watcher --dir /srv/halonic-engine/workspace
   ```

   This lists a run of `pr-watcher` every 10 minutes, completed.

A pass whose dones or wakes differ from what today's watcher wrote fails its
run at the `check` step. A Studio paired with the server doesn't show it: its
Inbox lists failed runs from its own computer only, and pairing moves only the
Messaging engine. Check the server for failed runs during the dry run:

```sh
engine runs --workflow pr-watcher --status failed --dir /srv/halonic-engine/workspace
engine runs show <run id> --dir /srv/halonic-engine/workspace
```

`runs show` names the difference in the failed step's error.

Each run's `decision`, written by the `decide` step, carries `truncated`:
`true` when the plugin's pass left tasks out, so the comparison didn't cover
all of them. It is in the run's events, not in `--output`, which prints only
model steps' output:

```sh
engine runs show <run id> --json --dir /srv/halonic-engine/workspace | jq '.events[] | select(.type == "context.updated" and .key == "decision") | .value.truncated'
```

## Deploy a new commit

```sh
sudo -u halonic-engine git -C /srv/halonic-engine/halonic fetch origin main
sudo -u halonic-engine git -C /srv/halonic-engine/halonic checkout --detach <new commit>
sudo -u halonic-engine pnpm --dir /srv/halonic-engine/halonic install --frozen-lockfile
echo "$(date -u +%FT%TZ) <new commit>" | sudo -u halonic-engine tee -a /srv/halonic-engine/deployed.log
sudo systemctl restart halonic-engine
```

Then repeat checks 2 and 5 from step 7.

## Roll back

Go back to the commit before the current one in `deployed.log`:

```sh
tail -n 2 /srv/halonic-engine/deployed.log
sudo -u halonic-engine git -C /srv/halonic-engine/halonic checkout --detach <previous commit>
sudo -u halonic-engine pnpm --dir /srv/halonic-engine/halonic install --frozen-lockfile
echo "$(date -u +%FT%TZ) <previous commit> (rollback)" | sudo -u halonic-engine tee -a /srv/halonic-engine/deployed.log
sudo systemctl restart halonic-engine
```

The password and the runs stay in the profile folder, so the routine goes on
after the restart. A pause doesn't: `serve` keeps it in memory and starts with
its routines on, so pause them again after the restart if you had paused them.
Repeat checks 2 and 5: the run list shows a new run after the rollback.

## Emergency off

```sh
sudo systemctl disable --now halonic-engine
```

This stops every routine at once, and the service doesn't start again at boot.
Runs that were going stop with the service. To start it again, run
`sudo systemctl enable --now halonic-engine` and repeat step 7.
