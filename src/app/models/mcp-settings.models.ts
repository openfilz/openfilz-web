/**
 * MCP connection details surfaced by GET /api/v1/settings, plus the copy/paste snippets
 * built from them.
 *
 * The same snippets exist on openfilz.com, but there they can only carry placeholders
 * (`https://openfilz-api.yourdomain.com/mcp`) because the site has no idea which deployment
 * the reader runs. In the app we know the real endpoint, realm and client id, so the snippets
 * are ready to paste — which is the whole point of showing them here rather than linking out.
 */
export interface McpConnection {
  /** Endpoint an MCP host connects to, e.g. https://api.openfilz.com/mcp */
  url: string;
  /** READ_ONLY or READ_WRITE — what the deployment lets an agent do. */
  mode: string;
  /** Keycloak realm URL the host authenticates against. */
  authorizationServerUrl: string;
  /** Keycloak client id for hosts that cannot self-register (DCR is off by design). */
  clientId: string;
}

export interface McpSnippet {
  /** Stable id, also the i18n key suffix for the tab label. */
  id: string;
  /** Highlight hint / caption — plain text, the code itself is never translated. */
  language: string;
  code: string;
}

/**
 * One snippet per AI tool, mirroring the openfilz.com quick-start so the two never tell a
 * different story. Code is deliberately NOT translated: it is copy/paste material.
 */
export function buildMcpSnippets(connection: McpConnection): McpSnippet[] {
  const url = connection.url;
  const tokenUrl = `${trimTrailingSlash(connection.authorizationServerUrl)}/protocol/openid-connect/token`;
  const clientId = connection.clientId;

  return [
    {
      id: 'token',
      language: 'bash',
      code: `# $OPENFILZ_TOKEN = a Keycloak access token — mint one with a service-account client
export OPENFILZ_TOKEN=$(curl -s -X POST \\
  ${tokenUrl} \\
  -d grant_type=client_credentials -d client_id=my-agent -d client_secret=<secret> \\
  | jq -r .access_token)`,
    },
    {
      id: 'claudeCode',
      language: 'bash',
      code: `# One command — then just ask Claude about your documents
claude mcp add --transport http openfilz \\
  ${url} \\
  --header "Authorization: Bearer $OPENFILZ_TOKEN"`,
    },
    {
      id: 'claudeDesktop',
      language: 'text',
      code: `# No token to paste — Claude signs in with your OpenFilz account (OAuth)
# 1. Settings → Connectors → Add custom connector
#    Name: OpenFilz — URL: ${url}
# 2. OAuth client: pick "Use your own OAuth client" → Client ID: ${clientId} (no secret)
#    (the default hosted-metadata and auto-register options fail against Keycloak)
# 3. Add → Connect → sign in — done`,
    },
    {
      id: 'cursor',
      language: 'json',
      code: `// .cursor/mcp.json
{
  "mcpServers": {
    "openfilz": {
      "url": "${url}",
      "headers": { "Authorization": "Bearer <your-token>" }
    }
  }
}`,
    },
    {
      id: 'vscode',
      language: 'json',
      code: `// .vscode/mcp.json
{
  "servers": {
    "openfilz": {
      "type": "http",
      "url": "${url}",
      "headers": { "Authorization": "Bearer <your-token>" }
    }
  }
}`,
    },
    {
      id: 'geminiCli',
      language: 'bash',
      code: `# Google Gemini CLI
gemini mcp add --transport http openfilz \\
  ${url} \\
  --header "Authorization: Bearer $OPENFILZ_TOKEN"`,
    },
    {
      id: 'n8n',
      language: 'text',
      code: `# MCP Client Tool node → connect it to an AI Agent node
#   Transport: HTTP Streamable
#   URL:       ${url}
#   Auth:      Header Auth — Authorization: Bearer <your-token>`,
    },
  ];
}

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
