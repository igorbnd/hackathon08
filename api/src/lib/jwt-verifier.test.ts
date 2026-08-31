import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { verifyCognitoJwt, __resetJwksCacheForTests } from './jwt-verifier.js';

/**
 * These tests exist because this file replaced an implementation that decoded the
 * JWT payload and trusted it without checking the signature. The first test is
 * the one that matters: a token with a forged `sub` and a junk signature must be
 * rejected. Under the old code it was accepted, which allowed any caller to read
 * and delete another user's invoices.
 */

const USER_POOL_ID = 'eu-west-2_TestPool1';
const CLIENT_ID = 'test-client-id';
const ISSUER = `https://cognito-idp.eu-west-2.amazonaws.com/${USER_POOL_ID}`;
const KID = 'test-key-1';

let privateKey: KeyObject;
let publicJwk: Record<string, unknown>;

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** Build a genuinely signed token, then let callers tamper with the parts. */
function signToken(
  payloadOverrides: Record<string, unknown> = {},
  headerOverrides: Record<string, unknown> = {},
): string {
  const nowSeconds = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', kid: KID, ...headerOverrides };
  const payload = {
    sub: 'legitimate-user-uuid',
    iss: ISSUER,
    token_use: 'access',
    client_id: CLIENT_ID,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
    ...payloadOverrides,
  };

  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = signer.sign(privateKey).toString('base64url');

  return `${signingInput}.${signature}`;
}

beforeEach(() => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  privateKey = pair.privateKey;
  publicJwk = {
    ...(pair.publicKey.export({ format: 'jwk' }) as Record<string, unknown>),
    kid: KID,
    alg: 'RS256',
    use: 'sig',
  };

  __resetJwksCacheForTests();

  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ keys: [publicJwk] }),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  __resetJwksCacheForTests();
});

const options = { userPoolId: USER_POOL_ID, clientId: CLIENT_ID };

describe('verifyCognitoJwt', () => {
  it('accepts a properly signed access token', async () => {
    const claims = await verifyCognitoJwt(signToken(), options);
    expect(claims).not.toBeNull();
    expect(claims?.sub).toBe('legitimate-user-uuid');
    expect(claims?.tokenUse).toBe('access');
  });

  it('rejects a token whose payload was swapped after signing', async () => {
    // The exact attack the old middleware permitted: keep a structurally valid
    // JWT, replace the subject with someone else's, leave the signature stale.
    const [header, , signature] = signToken().split('.');
    const forgedPayload = base64UrlJson({
      sub: 'victim-user-uuid',
      iss: ISSUER,
      token_use: 'access',
      client_id: CLIENT_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const forged = `${header}.${forgedPayload}.${signature}`;
    await expect(verifyCognitoJwt(forged, options)).resolves.toBeNull();
  });

  it('rejects an unsigned token claiming alg: none', async () => {
    const header = base64UrlJson({ alg: 'none', kid: KID });
    const payload = base64UrlJson({
      sub: 'victim-user-uuid',
      iss: ISSUER,
      token_use: 'access',
      client_id: CLIENT_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    await expect(
      verifyCognitoJwt(`${header}.${payload}.`, options),
    ).resolves.toBeNull();
  });

  it('rejects an expired token', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = signToken({ exp: nowSeconds - 3600, iat: nowSeconds - 7200 });
    await expect(verifyCognitoJwt(token, options)).resolves.toBeNull();
  });

  it('rejects a token signed by a different user pool', async () => {
    const token = signToken({
      iss: 'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_SomeoneElse',
    });
    await expect(verifyCognitoJwt(token, options)).resolves.toBeNull();
  });

  it('rejects a token minted for a different app client', async () => {
    const token = signToken({ client_id: 'some-other-app-client' });
    await expect(verifyCognitoJwt(token, options)).resolves.toBeNull();
  });

  it('rejects a token with an unknown signing key id', async () => {
    const token = signToken({}, { kid: 'a-kid-that-is-not-published' });
    await expect(verifyCognitoJwt(token, options)).resolves.toBeNull();
  });

  it('rejects malformed input', async () => {
    await expect(verifyCognitoJwt('not-a-jwt', options)).resolves.toBeNull();
    await expect(verifyCognitoJwt('a.b', options)).resolves.toBeNull();
    await expect(verifyCognitoJwt('', options)).resolves.toBeNull();
  });

  it('accepts an ID token bound to the client via aud', async () => {
    const token = signToken({
      token_use: 'id',
      aud: CLIENT_ID,
      client_id: undefined,
      email: 'user@example.com',
    });
    const claims = await verifyCognitoJwt(token, options);
    expect(claims?.tokenUse).toBe('id');
    expect(claims?.email).toBe('user@example.com');
  });

  it('caches the JWKS across calls rather than refetching per request', async () => {
    await verifyCognitoJwt(signToken(), options);
    await verifyCognitoJwt(signToken(), options);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});
