import {
  createPublicKey,
  createVerify,
  type JsonWebKey,
  type KeyObject,
} from 'node:crypto';

/**
 * Cognito JWT verification against the pool's JWKS.
 *
 * WHY THIS IS HAND-ROLLED: `aws-jwt-verify` is the library you would normally
 * reach for, and for a production system you should prefer it — it is
 * battle-tested in ways this file is not. It is avoided here for one practical
 * reason: this repo commits `package-lock.json`, and adding a dependency without
 * running `npm install` to regenerate the lockfile would leave the committed
 * lockfile inconsistent with `package.json`. Everything below therefore uses
 * only `node:crypto` and the global `fetch` present in the Node 20 runtime.
 *
 * WHAT IS CHECKED, and why each one matters:
 *   - RS256 signature against the pool's published public key (proves Cognito
 *     issued the token; this is the check whose absence allowed anyone to forge
 *     a `sub` and read another user's invoices)
 *   - `alg` is RS256 (rejects `alg: none` and HMAC confusion attacks, where an
 *     attacker signs with the public key as an HMAC secret)
 *   - `exp` / `nbf` (expired tokens stop working, so sign-out means something)
 *   - `iss` matches this specific user pool (a token from any other Cognito
 *     pool in any AWS account is a validly signed JWT — it just isn't ours)
 *   - `token_use` and the client binding (`client_id` on access tokens, `aud`
 *     on ID tokens) so a token minted for a different app client is rejected
 */

interface Jwk {
  kid: string;
  kty: string;
  alg?: string;
  n: string;
  e: string;
  use?: string;
}

export interface VerifiedClaims {
  sub: string;
  email: string;
  tokenUse: 'access' | 'id';
}

/** Tolerance for clock drift between Cognito and Lambda, in seconds. */
const CLOCK_SKEW_SECONDS = 60;

/** How long to trust a fetched JWKS before refetching. */
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;

// Module scope, so a warm Lambda container reuses the keys instead of hitting
// Cognito on every request.
let keyCache: Map<string, KeyObject> | null = null;
let keyCacheExpiresAt = 0;
let inFlightFetch: Promise<Map<string, KeyObject>> | null = null;
let lastUnknownKidRefetchAt = 0;

/**
 * Minimum gap between JWKS refetches triggered by an unrecognised `kid`.
 * Without this, a caller could send a stream of tokens bearing random key IDs
 * and turn each one into an outbound request to Cognito.
 */
const UNKNOWN_KID_REFETCH_INTERVAL_MS = 5 * 60 * 1000;

function base64UrlDecodeToString(segment: string): string {
  return Buffer.from(segment, 'base64url').toString('utf-8');
}

/**
 * Cognito user pool IDs are `{region}_{poolSuffix}`, so the region the pool
 * lives in is derivable from the ID itself. Falls back to the Lambda's own
 * region, which is the same in this deployment.
 */
function resolveRegion(userPoolId: string): string {
  const [prefix] = userPoolId.split('_');
  if (prefix && prefix.includes('-')) {
    return prefix;
  }
  return process.env.AWS_REGION ?? 'eu-west-2';
}

export function getIssuer(userPoolId: string): string {
  return `https://cognito-idp.${resolveRegion(userPoolId)}.amazonaws.com/${userPoolId}`;
}

async function fetchJwks(userPoolId: string): Promise<Map<string, KeyObject>> {
  const url = `${getIssuer(userPoolId)}/.well-known/jwks.json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`JWKS fetch failed with status ${response.status}`);
  }

  const body = (await response.json()) as { keys?: Jwk[] };
  if (!body.keys || body.keys.length === 0) {
    throw new Error('JWKS response contained no keys');
  }

  const keys = new Map<string, KeyObject>();
  for (const jwk of body.keys) {
    // Only RSA signing keys are usable here. Anything else is skipped rather
    // than thrown on, so one unexpected entry cannot break all verification.
    if (jwk.kty !== 'RSA' || !jwk.kid) continue;
    try {
      keys.set(
        jwk.kid,
        createPublicKey({ key: jwk as unknown as JsonWebKey, format: 'jwk' }),
      );
    } catch {
      continue;
    }
  }

  if (keys.size === 0) {
    throw new Error('JWKS contained no usable RSA keys');
  }

  return keys;
}

/**
 * Returns the pool's signing keys, refetching when the cache has expired or
 * when a `kid` we have never seen shows up (which is what a key rotation looks
 * like). Concurrent callers share one in-flight fetch.
 */
async function getSigningKey(
  userPoolId: string,
  kid: string,
): Promise<KeyObject | undefined> {
  const now = Date.now();
  const cacheIsFresh = keyCache !== null && now < keyCacheExpiresAt;

  if (cacheIsFresh && keyCache!.has(kid)) {
    return keyCache!.get(kid);
  }

  // A fresh cache that is missing this kid means either a genuine key rotation
  // or a bogus token. Refetching covers rotation, but must be rate limited so
  // the second case cannot be used to generate traffic to Cognito on demand.
  if (cacheIsFresh) {
    if (now - lastUnknownKidRefetchAt < UNKNOWN_KID_REFETCH_INTERVAL_MS) {
      return undefined;
    }
    lastUnknownKidRefetchAt = now;
  }

  // Guard against a stampede of parallel invocations all refetching at once.
  if (!inFlightFetch) {
    inFlightFetch = fetchJwks(userPoolId)
      .then((keys) => {
        keyCache = keys;
        keyCacheExpiresAt = Date.now() + JWKS_CACHE_TTL_MS;
        return keys;
      })
      .finally(() => {
        inFlightFetch = null;
      });
  }

  const keys = await inFlightFetch;
  return keys.get(kid);
}

/**
 * Verify a Cognito JWT. Returns the claims on success, or null on any failure.
 *
 * Deliberately returns null rather than throwing, and never reports *why* to
 * the caller, so a handler cannot accidentally leak the reason a token was
 * rejected back to the client. The reason is logged by the caller instead.
 */
export async function verifyCognitoJwt(
  token: string,
  options: { userPoolId: string; clientId?: string },
): Promise<VerifiedClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  let header: { alg?: string; kid?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(base64UrlDecodeToString(encodedHeader));
    payload = JSON.parse(base64UrlDecodeToString(encodedPayload));
  } catch {
    return null;
  }

  // Pin the algorithm before touching the key. Accepting whatever `alg` the
  // token asks for is the classic JWT vulnerability.
  if (header.alg !== 'RS256' || !header.kid) return null;

  // A JWKS fetch failure (Cognito unreachable, throttled, malformed response)
  // must deny rather than propagate. Letting it throw would surface as a 500
  // from the handler's outer catch, which both misreports the cause and makes
  // the failure mode of an outage harder to read in logs.
  let key: KeyObject | undefined;
  try {
    key = await getSigningKey(options.userPoolId, header.kid);
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'ERROR',
        message: 'Unable to retrieve Cognito signing keys; denying request',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
  if (!key) return null;

  let signatureValid = false;
  try {
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${encodedHeader}.${encodedPayload}`);
    signatureValid = verifier.verify(key, Buffer.from(encodedSignature, 'base64url'));
  } catch {
    return null;
  }
  if (!signatureValid) return null;

  // ── Signature is good; now the claims have to be right too. ──

  const nowSeconds = Math.floor(Date.now() / 1000);

  const exp = typeof payload.exp === 'number' ? payload.exp : undefined;
  if (exp === undefined || nowSeconds > exp + CLOCK_SKEW_SECONDS) return null;

  const nbf = typeof payload.nbf === 'number' ? payload.nbf : undefined;
  if (nbf !== undefined && nowSeconds < nbf - CLOCK_SKEW_SECONDS) return null;

  if (payload.iss !== getIssuer(options.userPoolId)) return null;

  // Written as an explicit mapping rather than a pair of inequality guards so
  // the resulting type is a literal union without relying on narrowing from
  // `unknown`.
  const tokenUse: 'access' | 'id' | null =
    payload.token_use === 'access'
      ? 'access'
      : payload.token_use === 'id'
        ? 'id'
        : null;
  if (tokenUse === null) return null;

  // Access tokens carry `client_id`; ID tokens carry `aud`. Either way the
  // token must have been minted for our app client.
  if (options.clientId) {
    const boundClient = tokenUse === 'access' ? payload.client_id : payload.aud;
    if (boundClient !== options.clientId) return null;
  }

  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  if (!sub) return null;

  return {
    sub,
    // Access tokens do not include email. Callers must not rely on it being
    // populated; userId is the only identity claim that is always present.
    email: typeof payload.email === 'string' ? payload.email : '',
    tokenUse,
  };
}

/** Test seam: drop the cached JWKS so a test can control what gets fetched. */
export function __resetJwksCacheForTests(): void {
  keyCache = null;
  keyCacheExpiresAt = 0;
  inFlightFetch = null;
  lastUnknownKidRefetchAt = 0;
}
