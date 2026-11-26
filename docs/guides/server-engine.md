# Server engine runbook

How to run `halonic serve` as a service on the server that runs Paperclip, so
routines with no model run there on a schedule. Only the board's server session
follows this runbook on the server. Authors write and review it; they never
deploy.

This is part 1: the server engine listens on `127.0.0.1` only. There is no
proxy site and no public hostname, so nothing outside the server can reach it.

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
| Profile folder | `/srv/halonic-engine/.local/share/halonic`: the sign-in password, runs, cache |
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

The test routine needs no Paperclip key, and part 1 adds none. This version
has no way to add the key to a server. Don't write it into the profile's
secrets file, the unit, an environment variable or the engine workspace by
hand: the server reads it only from the record that the sign-in on the server
stores (`server.paperclip-key-store`).

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
