export type GatewayTokenConfig = {
  gatewayTokenSecretRef?: string;
  gatewayToken?: string;
};

type CachedToken = {
  cacheKey: string;
  token: string;
};

let cachedToken: CachedToken | null = null;

function tokenCacheKey(config: GatewayTokenConfig): string {
  const secretRef = config.gatewayTokenSecretRef?.trim();
  if (secretRef) return `secret:${secretRef}`;
  const inlineToken = config.gatewayToken?.trim();
  if (inlineToken) return `inline:${inlineToken}`;
  return "";
}

export function clearGatewayTokenCache(): void {
  cachedToken = null;
}

export async function resolveGatewayToken(
  config: GatewayTokenConfig,
  resolveSecret: (secretRef: string) => Promise<string>,
): Promise<string> {
  const cacheKey = tokenCacheKey(config);
  if (!cacheKey) return "";
  if (cachedToken?.cacheKey === cacheKey) return cachedToken.token;

  const secretRef = config.gatewayTokenSecretRef?.trim();
  const token = secretRef
    ? await resolveSecret(secretRef)
    : config.gatewayToken?.trim() || "";

  if (token) {
    cachedToken = { cacheKey, token };
  }
  return token;
}
