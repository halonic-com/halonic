#!/bin/sh
# Trusts the Containers CA, then runs the container's command as the non-root `halonic` user.
# Runs as root only for the CA step. The platform places the CA file when the container starts,
# so this can't happen at build time. The path is confirmed by the deployed check (HAL-18021).
set -eu

ca_file="/etc/cloudflare/certs/cloudflare-containers-ca.crt"

if [ -f "$ca_file" ]; then
  cp "$ca_file" /usr/local/share/ca-certificates/cloudflare-containers-ca.crt
  update-ca-certificates >/dev/null
else
  # Not fatal: without the CA, intercepted HTTPS fails closed, which the run reports.
  echo "trust-containers-ca: $ca_file not found; intercepted HTTPS will fail" >&2
fi

# Node keeps its own CA list; point it at the system one too.
export NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

exec setpriv --reuid=halonic --regid=halonic --init-groups -- "$@"
