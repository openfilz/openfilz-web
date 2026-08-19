#!/bin/sh
# Generates /usr/share/nginx/html/ngx-env.js at container start from the NG_APP_*
# environment variables, so the Angular runtime config lives ONLY in the deployment
# env (compose `environment:`, K8s env) instead of a separately-mounted ngx-env.js.
# Runs via the nginx image's /docker-entrypoint.d mechanism.
#
# Opt-in: if NO NG_APP_* var is present in the environment, the existing file (baked
# into the image, or mounted as a volume/ConfigMap) is left untouched — keeps
# mounted-file deployments working and never writes to a read-only mount.
set -eu

target="/usr/share/nginx/html/ngx-env.js"

# Collect NG_APP_* variable names (busybox awk exposes ENVIRON).
names=$(awk 'BEGIN { for (n in ENVIRON) if (n ~ /^NG_APP_/) print n }' | sort)

if [ -z "$names" ]; then
  echo "[openfilz] ngx-env.js: no NG_APP_* env vars, keeping existing file"
  exit 0
fi

{
  printf 'globalThis._NGX_ENV_ = {\n'
  first=1
  for name in $names; do
    eval "val=\${$name}"
    # JSON-escape backslash then double-quote (values are simple URLs/booleans).
    esc=$(printf '%s' "$val" | sed 's/\\/\\\\/g; s/"/\\"/g')
    if [ "$first" -eq 1 ]; then first=0; else printf ',\n'; fi
    printf '  "%s": "%s"' "$name" "$esc"
  done
  printf '\n};\n'
} > "$target"

echo "[openfilz] ngx-env.js generated from $(printf '%s' "$names" | wc -w) NG_APP_* var(s)"
