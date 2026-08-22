import type { APIGatewayProxyEventV2 } from 'aws-lambda';

export interface AuthClaims {
  userId: string;
  email: string;
  sub: string;
}

/**
 * Decode a base64url encoded string.
 */
function base64UrlDecode(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf-8');
}

/**
 * Decode JWT payload without verification (for demo/local dev).
 * In production, use a proper JWT verification library with JWKS.
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  const payload = base64UrlDecode(parts[1]);
  return JSON.parse(payload);
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
 * Authenticate request by extracting and validating JWT from Authorization header.
 * Returns user claims (userId, email) on success.
 *
 * KNOWN LIMITATION (demo): This performs base64 decode only, without cryptographic
 * signature verification. In production, use aws-jwt-verify to validate the JWT
 * against Cognito JWKS (verifying iss, aud, exp, and signature).
 */
export function authenticateRequest(
  event: APIGatewayProxyEventV2,
): AuthClaims | null {
  const authHeader =
    event.headers?.['authorization'] ?? event.headers?.['Authorization'];
  const token = extractBearerToken(authHeader);

  if (!token) {
    return null;
  }

  try {
    const payload = decodeJwtPayload(token);

    const sub = (payload.sub as string) ?? '';
    const email = (payload.email as string) ?? '';

    if (!sub) {
      return null;
    }

    return {
      userId: sub,
      email,
      sub,
    };
  } catch {
    return null;
  }
}

/**
 * Get userId from request, falling back to demo user for local development.
 */
export function getUserIdFromRequest(
  event: APIGatewayProxyEventV2,
): string | null {
  const claims = authenticateRequest(event);
  if (claims) {
    return claims.userId;
  }

  // In local dev mode, allow demo user
  if (process.env.STAGE === 'local') {
    return 'demo-user-001';
  }

  return null;
}
