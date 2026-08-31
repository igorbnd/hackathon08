import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { verifyCognitoJwt } from './jwt-verifier.js';

export interface AuthClaims {
  userId: string;
  email: string;
  sub: string;
}

/**
 * Extract Bearer token from Authorization header.
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;
  return parts[1];
}

/**
 * Authenticate a request by cryptographically verifying the Cognito JWT in the
 * Authorization header. Returns the caller's claims, or null if the token is
 * missing, malformed, expired, or not signed by our user pool.
 *
 * This previously base64-decoded the payload and trusted it without verifying
 * the signature, which meant any client could mint `{"sub": "<victim>"}` and
 * read, edit or delete another user's invoices. Every downstream handler scopes
 * its DynamoDB access to `USER#{userId}`, so the correctness of that isolation
 * rests entirely on this function. See jwt-verifier.ts for the checks applied.
 *
 * Fails closed: if the user pool is not configured, no request is authenticated
 * (except in local dev, handled by getUserIdFromRequest).
 */
export async function authenticateRequest(
  event: APIGatewayProxyEventV2,
): Promise<AuthClaims | null> {
  const authHeader =
    event.headers?.['authorization'] ?? event.headers?.['Authorization'];
  const token = extractBearerToken(authHeader);

  if (!token) {
    return null;
  }

  const userPoolId = process.env.USER_POOL_ID;
  if (!userPoolId) {
    // Misconfiguration, not an auth failure. Refusing the request is the only
    // safe response — the alternative is silently trusting unverified tokens,
    // which is the bug this function exists to fix.
    //
    // Local dev legitimately runs without a pool configured, so this is only
    // worth shouting about in a deployed stage.
    if (process.env.STAGE !== 'local') {
      console.error(
        JSON.stringify({
          level: 'ERROR',
          message: 'USER_POOL_ID is not set; refusing to authenticate request',
        }),
      );
    }
    return null;
  }

  const claims = await verifyCognitoJwt(token, {
    userPoolId,
    clientId: process.env.USER_POOL_CLIENT_ID,
  });

  if (!claims) {
    return null;
  }

  return {
    userId: claims.sub,
    email: claims.email,
    sub: claims.sub,
  };
}

/**
 * Get userId from request, falling back to a demo user for local development.
 *
 * The local fallback is gated on STAGE === 'local', which is set only by the
 * local Express adapter. It is never set in any deployed stage.
 */
export async function getUserIdFromRequest(
  event: APIGatewayProxyEventV2,
): Promise<string | null> {
  if (process.env.STAGE === 'local') {
    const claims = await authenticateRequest(event).catch(() => null);
    return claims?.userId ?? 'demo-user-001';
  }

  const claims = await authenticateRequest(event);
  return claims?.userId ?? null;
}
