# openfilz-web Helm chart

Deploys the OpenFilz web UI (Angular, served by nginx) on Kubernetes or
OpenShift. The container generates `ngx-env.js` at startup from the
`NG_APP_*` environment variables — the same mechanism as the compose
deployment.

The chart lives in **this repository** so it releases with the app: the
release workflow publishes it to `oci://ghcr.io/openfilz/charts/openfilz-web`
with **chart version = appVersion = image tag**, so chart `X.Y.Z` runs
`openfilz-web:X.Y.Z` by default.

Two ways to use it:

- **Standalone** — point it at an existing openfilz-api (`hosts.api` or
  `app.apiUrl`) and Keycloak (`auth.publicAuthority`).
- **As a subchart of `openfilz-ce`** (openfilz-core repo, `deploy/helm/`) —
  the umbrella declares an OCI dependency on this chart (`1.x.x`) and wires
  hosts/auth/OnlyOffice through the `global:` values block.

## Install (standalone)

```bash
helm install my-web oci://ghcr.io/openfilz/charts/openfilz-web --version <X.Y.Z> \
  --namespace my-namespace --create-namespace \
  --set hosts.web=app.example.com \
  --set hosts.api=api.example.com \
  --set ingress.className=nginx \
  --set auth.publicAuthority=https://auth.example.com/realms/openfilz
```

(Or from this checkout: `helm install my-web deploy/helm/openfilz-web ...`.)

Example values: [`example-values/values-kind.yaml`](example-values/values-kind.yaml)
(local kind, no auth) and [`example-values/values-oc.yaml`](example-values/values-oc.yaml)
(OpenShift Route).

## Key values

| Value | Description | Default |
| :--- | :--- | :--- |
| `image.registry/repository/tag` | Image; empty tag → `global.imageTag` → chart appVersion | `ghcr.io/openfilz/openfilz-web:<appVersion>` |
| `hosts.web` / `hosts.api` | Public hostnames (ingress host + API URL derivation) | `""` (→ `global.hosts.*`) |
| `app.apiUrl` / `app.graphQlUrl` | Override the `https://<hosts.api>/...` derivation | derived |
| `auth.enabled` | `NG_APP_AUTHENTICATION_ENABLED` | `true` (via global) |
| `auth.publicAuthority` | Browser-facing issuer (must match the token `iss` claim) | `""` |
| `auth.clientId` | OIDC client id | `openfilz-web` |
| `onlyoffice.enabled` / `onlyoffice.publicUrl` | OnlyOffice editor integration | disabled |
| `ingress.*` | className, `tlsSecretName`, `path`, annotations | enabled, `/` |
| `openshift.enabled` + `openshift.route.*` | OpenShift Route instead of Ingress | disabled |
| `extraEnv` | Extra `NG_APP_*` env vars via a chart-managed ConfigMap | `{}` |

## The `global:` contract (cross-repo interface)

The `openfilz-ce` umbrella chart (openfilz-core repo) injects shared settings
through Helm globals, resolved by this chart's `_helpers.tpl` as
*chart-local value → `global.*` → default*:

`global.imageTag`, `global.hosts.{web,api}`,
`global.ingress.{enabled,className,tlsSecretName}`,
`global.auth.{enabled,publicAuthority,clientId}`,
`global.onlyoffice.{enabled,publicUrl}`,
`global.nodeSelector`, `global.tolerations`.

**Do not rename these keys casually** — they are consumed by the umbrella in
openfilz-core; coordinate changes across both repos.
