# Start a routine with a webhook

A routine with a `webhook` trigger starts when another program sends it a
signed web request, such as a shop that posts each new order. `halonic serve`
receives the request, checks its signature, and starts the routine's workflow
or agent with the request's body.

## Set up the routine

1. In the routine file, give it a `webhook` trigger with the name of a
   secret of your own:

   ```yaml
   name: New order
   trigger:
     webhook:
       secret: orders-hook
       headers: [x-shop-event]
   run:
     workflow: handle-order
     input:
       order: "{{trigger.body}}"
       event: "{{trigger.headers.x-shop-event}}"
   ```

   `headers` lists the request headers the run may read, in lowercase. Leave
   it out when the run needs none. A routine on a webhook can use
   `{{trigger.at}}`, `{{trigger.lastRun}}`, `{{trigger.body}}` and
   `{{trigger.headers.<name>}}` for a header it lists. `halonic validate`
   reports any other value.

2. Set the secret. Halonic asks for its value, so it never shows in your
   shell history:

   ```sh
   halonic secret set orders-hook
   ```

   Give the same value to the program that sends the requests. Don't use the
   name of one of Halonic's own secrets, such as `serve-password`.

3. Run `halonic serve`. It prints the address of each webhook routine that is
   on:

   ```text
   New order starts on a web request at http://localhost:4747/api/webhooks/shop/new-order
   ```

   The address ends with the routine's hub and the routine's id. A routine
   in the workspace itself, not in a hub, has `@workspace` in place of the
   hub, such as `/api/webhooks/@workspace/new-order`. A ✕ line
   under it says why the routine won't start, such as a secret that isn't set.

## Sign a request

Send a `POST` to the routine's address with these three headers:

| Header | What it holds |
| --- | --- |
| `x-halonic-delivery` | an id of your own for this delivery: letters, digits and `. _ : -`, up to 128 |
| `x-halonic-timestamp` | the time you send it, in seconds since 1970 (Unix time) |
| `x-halonic-signature` | `sha256=` and the HMAC-SHA256 of `<delivery>.<timestamp>.<body>`, in lowercase hex, keyed with the secret's value |

The signed text is the delivery id, a dot, the timestamp, a dot, then the
request body exactly as you send it, byte for byte. For example, in a shell:

```sh
body='{"order":"A-1001"}'
delivery="order-A-1001"
timestamp=$(date +%s)
signature=$(printf '%s.%s.%s' "$delivery" "$timestamp" "$body" \
  | openssl dgst -sha256 -hmac "$ORDERS_HOOK" | sed 's/^.*= //')
curl -X POST http://localhost:4747/api/webhooks/shop/new-order \
  -H "x-halonic-delivery: $delivery" \
  -H "x-halonic-timestamp: $timestamp" \
  -H "x-halonic-signature: sha256=$signature" \
  -H "x-shop-event: order.created" \
  --data "$body"
```

Here `ORDERS_HOOK` holds the secret's value in the sender's environment.

## Read the answer

| Answer | What it means |
| --- | --- |
| 202 with `runId` | The run started. |
| 202 with `skipped` | A run of the routine is still going and its `overlap` is `skip`, so nothing started. |
| 401 | The request isn't signed right for this address: a header is missing, the timestamp is more than 5 minutes off, the signature doesn't match, or the routine is off, missing or has no secret set. The answer doesn't say which. |
| 400 | The routine can't start, for the reason in the answer, such as a value its trigger doesn't have. `halonic serve` prints the same reason. |
| 403 | The workspace changed since it was trusted. Run `halonic trust`. |
| 409 | This delivery id was already received. A resend with the same id starts nothing. |
| 429 | A run of the routine is still going and its `overlap` is `queue`. Send it again after the time in `Retry-After`. |

When the server refuses a signed request with a 400, or fails it, the
terminal that runs `halonic serve` prints a line such as:

```text
✕ New order didn't start on a web request: {{trigger.date}} isn't a trigger value. Use {{trigger.at}}, {{trigger.lastRun}}, {{trigger.body}} or {{trigger.headers.<name>}}.
```

Fix the routine file, then sign the request again with a fresh timestamp and
send it. A refused delivery doesn't use up its id.
