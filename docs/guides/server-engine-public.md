# Server engine runbook, part 2: the public name

How to open the server engine from [part 1](server-engine.md) to the board's
desktops under a public name, `engine.<your domain>`, next to the name
Paperclip uses. Only the board's server session follows this runbook on the
server. Authors write and review it; they never deploy.

The server engine still listens on `127.0.0.1` only. The way in from outside is
the Cloudflare Tunnel that already fronts Paperclip: Cloudflare Access checks
who is asking, the tunnel forwards only `/api/*` to the loopback port, and the
server accepts only the public name in `Host`
([`server.public-endpoint`](../../packages/host/server/requirements/public-endpoint.md)).
Pairing a device is the second layer, never the only one. The checks on this
page are in
[`cli.commands.serve.public-runbook`](../../apps/cli/src/commands/serve/requirements/public-runbook.md).

## What you add

| What | Where |
| --- | --- |
| Public name | `engine.<your domain>`, in the same Cloudflare account as Paperclip's |
| Unit override | `/etc/systemd/system/halonic-engine.service.d/public.conf`: `serve --public-origin` |
| Access application | `engine.<your domain>`, every path, the same policy as Paperclip |
| Rate-limiting rule | `POST /api/pair` and `POST /api/devices/code` on `engine.<your domain>` |
| Tunnel route | `engine.<your domain>`, path `^/api/`, to `http://127.0.0.1:4747` |

The steps go in this order on purpose: the name gets its Access application and
its rate limit before the tunnel route exists, and the tunnel route, which
makes the name resolve, comes only after both reviews.

## Before you start

- Part 1 is done, and its step 7 checks pass.
- The deployed commit logs every finished request to the journal, as
  `<method> <path> <status>`, with no query, header or body.
- The paired desktop's way through Access is decided. Until it is, a desktop
  can't pair through the public name. Step 2 says where it goes.

## 1. Serve at the public name

Make the override folder:

```sh
sudo mkdir -p /etc/systemd/system/halonic-engine.service.d
```

Then write `/etc/systemd/system/halonic-engine.service.d/public.conf`:

```ini
[Service]
ExecStart=
ExecStart=/usr/local/bin/pnpm exec node apps/cli/bin/halonic.js serve --dir /srv/halonic-engine/workspace --public-origin https://engine.<your domain> --port 4747
```

Use the same `pnpm` path as the unit. The empty `ExecStart=` clears the unit's
own line. Everything else stays from the unit: the service user, `UMask`, and
loopback traffic only, which the tunnel needs, because `cloudflared` runs on
this server and connects to `127.0.0.1`.

```sh
sudo systemctl daemon-reload
sudo systemctl restart halonic-engine
journalctl -u halonic-engine -n 20
```

The log shows `Serving Server engine at https://engine.<your domain>`. If it
says the public address needs a password instead, part 1's step 4 wasn't done.

Check it on the server:

```sh
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: engine.<your domain>' http://127.0.0.1:4747/api/hello
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4747/api/hello
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: other.example' http://127.0.0.1:4747/api/hello
```

These print `200`, then `421` and `421`: with a public origin the server refuses
loopback names and every other name.

## 2. Put Access in front of the name

In Cloudflare Zero Trust, under Access, Applications, add a self-hosted
application:

- Domain: `engine.<your domain>`, with no path, so it covers every path.
- Policies: the same as Paperclip's main application, so only the board's
  identities get in.
- Add no bypass policy for `/api/*`. On Paperclip's name the API bypasses
  Access because the desktop engine calls it; here `/api/*` is the whole name,
  so a bypass would leave nothing behind Access.

The paired desktop needs its own way through this application, because it
calls the server with no browser. That is decided separately; add it to the
policies here once it is.

## 3. Limit pairing at Cloudflare

The server already answers the 11th wrong pairing code in 15 minutes with
`429`. Behind the tunnel every request reaches it from `127.0.0.1`, so that
limit counts all callers together. A Cloudflare rule counts each visitor's
address on its own, before the request reaches the server.

Under Security, WAF, Rate limiting rules, add one rule for the zone:

- If incoming requests match:
  `http.host eq "engine.<your domain>" and http.request.method eq "POST" and http.request.uri.path in {"/api/pair" "/api/devices/code"}`
- Count by IP, 5 requests per period, with the longest period and block time
  your plan offers.
- Action: Block.

`POST /api/pair/status` isn't in the rule: a desktop asks it every few seconds
while it waits for Allow.

## 4. Get both reviews

Before the name resolves, link these on the deploy task:

1. The security review of the server build, signed by Julian.
2. The A0 delta review for the public name
   ([release review](release-review.md)).

Without both, stop here. Steps 1 to 3 change nothing anyone outside can reach.

## 5. Add the tunnel route

In Cloudflare Zero Trust, under Networks, Tunnels, open the tunnel that
fronts Paperclip and add a public hostname:

| Field | Value |
| --- | --- |
| Subdomain | `engine` |
| Domain | `<your domain>` |
| Path | `^/api/` |
| Service | `http://127.0.0.1:4747` |

Leave the HTTP Host header setting empty, so the server sees
`engine.<your domain>`. Saving the route makes the name resolve. A path outside
`/api/` falls through to the tunnel's last rule, which answers `404` without
reaching the server.

## 6. Check it

From a computer that isn't the server, with no Access session:

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://engine.<your domain>/api/hello
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: 127.0.0.1' https://engine.<your domain>/api/hello
curl -m 5 http://<server address>:4747/api/hello
```

1. The first prints `302` or `403` from Access, never `200`.
2. The second never prints `200`: Cloudflare doesn't route a name it doesn't
   serve.
3. The third fails with a timeout or "connection refused", never with an
   answer.

In a browser signed in to Access:

4. `https://engine.<your domain>/api/hello` shows the server's hello.
5. `https://engine.<your domain>/` shows the tunnel's `404`, not a Studio page.

On the server:

6. Make a pairing code with `engine serve pair` (the `engine` helper from part
   1) and pair the board's desktop. The journal shows a `POST /api/pair` line
   with status `200`, and neither the code nor the token:

   ```sh
   journalctl -u halonic-engine --since '-15 min' | grep 'POST /api/pair'
   ```

7. Ten wrong codes, then an eleventh:

   ```sh
   for try in 1 2 3 4 5 6 7 8 9 10 11; do curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: engine.<your domain>' -H 'Content-Type: application/json' -d '{"code":"AAAA-AAAA","deviceName":"limit check"}' http://127.0.0.1:4747/api/pair; done
   journalctl -u halonic-engine --since '-5 min' | grep -c 'POST /api/pair 429'
   journalctl -u halonic-engine --since '-5 min' | grep -c 'AAAA'
   ```

   The loop prints `401` ten times, then `429`. The journal has at least one
   `429` line and no `AAAA`. Run this after step 6: for the next 15 minutes the
   server refuses every pairing code and every password typed again.

## Deploy a new commit

As in part 1. The override stays, so the server comes back at the public name.
Then repeat checks 1 and 4 from step 6.

## Roll back

As in part 1. The device sessions stay in the profile folder, so the paired
desktop stays signed in: after the restart it shows the server's messages
again, without pairing. Repeat checks 1 and 4 from step 6.

## Emergency off

Stop the server first, then take the name away:

```sh
sudo systemctl disable --now halonic-engine
```

Then delete the public hostname from the tunnel and the `engine` DNS record.
The desktops show the source as offline, with their cache. To take the name
away and keep the routines running, delete the public hostname and the record
only, then remove the override and restart:

```sh
sudo rm /etc/systemd/system/halonic-engine.service.d/public.conf
sudo systemctl daemon-reload
sudo systemctl restart halonic-engine
```

The server is back to part 1: loopback only.

## A second way in later

Nothing here assumes the public name is the only way in. A private network,
such as a tailnet, can later reach the same loopback port through its own
proxy on this server, as an extra layer in front of the server or in place of
the tunnel route. That proxy sends `Host: engine.<your domain>`, the one name
the server accepts.
