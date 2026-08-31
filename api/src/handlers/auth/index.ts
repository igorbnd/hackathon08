import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import {
  adminCreateConfirmedUser,
  initiateAuth,
  globalSignOut,
  forgotPassword,
  confirmForgotPassword,
  adminDeleteUser,
  cognitoClient,
  CLIENT_ID,
} from '../../lib/cognito.js';
import {
  InitiateAuthCommand,
  type AuthFlowType,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  buildPK,
  buildSK,
  queryItems,
  deleteItem,
} from '../../lib/dynamodb.js';
import { success, error, corsPreflightResponse } from '../../lib/response.js';
import { authenticateRequest } from '../../lib/auth-middleware.js';
import { createLogger } from '../../lib/logger.js';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

const s3Client = new S3Client({});
const DOCUMENTS_BUCKET = process.env.DOCUMENTS_BUCKET!;

// ─── Validation Schemas ─────────────────────────────────────────────────────

const SignUpSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().optional(),
});

const SignInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const ForgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const ConfirmForgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
  confirmationCode: z.string().min(1, 'Confirmation code is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

// ─── Main Handler ───────────────────────────────────────────────────────────

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const logger = createLogger({
    requestId: event.requestContext?.requestId ?? 'unknown',
  });

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS' || (event as any).requestContext?.http?.method === 'OPTIONS') {
    return corsPreflightResponse() as APIGatewayProxyResult;
  }

  const path = (event.path ?? (event as any).rawPath ?? '').replace(/\/$/, ''); // Normalize trailing slash
  const method = event.httpMethod ?? (event as any).requestContext?.http?.method ?? '';

  logger.info('Auth request received', { path, method });

  try {
    switch (path) {
      case '/auth/signup':
        return await handleSignUp(event, logger);
      case '/auth/signin':
        return await handleSignIn(event, logger);
      case '/auth/signout':
        return await handleSignOut(event, logger);
      case '/auth/refresh':
        return await handleRefresh(event, logger);
      case '/auth/forgot-password':
        return await handleForgotPassword(event, logger);
      case '/auth/confirm-forgot-password':
        return await handleConfirmForgotPassword(event, logger);
      case '/auth/export':
        return await handleExport(event, logger);
      case '/auth/delete-account':
        return await handleDeleteAccount(event, logger);
      default:
        return error('Not found', 404) as APIGatewayProxyResult;
    }
  } catch (err: unknown) {
    const friendly = friendlyCognitoMessage(err, path);
    if (friendly) {
      return error(friendly, 400) as APIGatewayProxyResult;
    }
    logger.error('Unhandled error in auth handler', err);
    return error('Internal server error', 500) as APIGatewayProxyResult;
  }
};

/**
 * Translate Cognito exceptions into messages a user can act on.
 *
 * Returns null for anything unrecognised, which the caller then treats as a 500
 * — so an unexpected failure is never dressed up as a user error.
 */
function friendlyCognitoMessage(err: unknown, path: string): string | null {
  const name = (err as { name?: string })?.name;
  const raw = (err as { message?: string })?.message;

  switch (name) {
    // Both map to the same text on sign-in so that a wrong password and an
    // email with no account are indistinguishable. Returning different messages
    // would let anyone enumerate which addresses are registered.
    case 'NotAuthorizedException':
    case 'UserNotFoundException':
      if (path === '/auth/signin') return 'Incorrect email or password.';
      if (path === '/auth/refresh') {
        return 'Your session has expired. Please sign in again.';
      }
      return 'That request could not be authorised.';

    case 'UsernameExistsException':
      return 'An account with that email address already exists.';

    case 'UserNotConfirmedException':
      return 'That account has not been confirmed. Please sign up again or contact support.';

    // Cognito states which specific rule failed here, which is genuinely more
    // useful than anything generic we could substitute.
    case 'InvalidPasswordException':
      return raw ?? 'That password does not meet the requirements.';

    case 'CodeMismatchException':
      return 'That code is not correct. Please check it and try again.';

    case 'ExpiredCodeException':
      return 'That code has expired. Please request a new one.';

    case 'LimitExceededException':
    case 'TooManyRequestsException':
    case 'TooManyFailedAttemptsException':
      return 'Too many attempts. Please wait a few minutes and try again.';

    case 'InvalidParameterException':
      return raw ?? 'One of the details provided was not valid.';

    default:
      return null;
  }
}

// ─── Sub-Handlers ───────────────────────────────────────────────────────────

async function handleSignUp(
  event: APIGatewayProxyEvent,
  logger: ReturnType<typeof createLogger>,
): Promise<APIGatewayProxyResult> {
  const body = parseBody(event.body);
  const validation = SignUpSchema.safeParse(body);

  if (!validation.success) {
    return error(
      validation.error.errors.map((e) => e.message).join(', '),
      400,
    ) as APIGatewayProxyResult;
  }

  const { email, password, name } = validation.data;
  logger.info('Sign-up attempt', { action: 'signup' });

  // Created through the admin API rather than the public SignUp API so that
  // Cognito sends no verification email. The account is confirmed immediately,
  // so emailing a code the user never needs to enter is just confusing.
  //
  // This also removes the previous partial-failure state: signup either fully
  // succeeds (confirmed, email verified, signable-in) or throws. There is no
  // longer a path that creates an account which cannot be used.
  const result = await adminCreateConfirmedUser({ email, password, name });

  logger.info('Sign-up successful', {
    action: 'signup',
    userId: result.userSub,
  });

  return success(
    {
      message: 'Account created successfully',
      userId: result.userSub,
      confirmed: true,
    },
    201,
  ) as APIGatewayProxyResult;
}

async function handleSignIn(
  event: APIGatewayProxyEvent,
  logger: ReturnType<typeof createLogger>,
): Promise<APIGatewayProxyResult> {
  const body = parseBody(event.body);
  const validation = SignInSchema.safeParse(body);

  if (!validation.success) {
    return error(
      validation.error.errors.map((e) => e.message).join(', '),
      400,
    ) as APIGatewayProxyResult;
  }

  const { email, password } = validation.data;
  logger.info('Sign-in attempt', { action: 'signin' });

  const result = await initiateAuth(email, password);

  logger.info('Sign-in successful', { action: 'signin' });

  return success({
    accessToken: result.accessToken,
    idToken: result.idToken,
    refreshToken: result.refreshToken,
    expiresIn: result.expiresIn,
  }) as APIGatewayProxyResult;
}

async function handleSignOut(
  event: APIGatewayProxyEvent,
  logger: ReturnType<typeof createLogger>,
): Promise<APIGatewayProxyResult> {
  const authHeader =
    event.headers?.['authorization'] ?? event.headers?.['Authorization'];

  if (!authHeader) {
    return error('Authorization header required', 401) as APIGatewayProxyResult;
  }

  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (!token) {
    return error('Invalid authorization token', 401) as APIGatewayProxyResult;
  }

  logger.info('Sign-out attempt', { action: 'signout' });

  await globalSignOut(token);

  logger.info('Sign-out successful', { action: 'signout' });

  return success({ message: 'Signed out successfully' }) as APIGatewayProxyResult;
}

async function handleRefresh(
  event: APIGatewayProxyEvent,
  logger: ReturnType<typeof createLogger>,
): Promise<APIGatewayProxyResult> {
  const body = parseBody(event.body);
  const validation = RefreshSchema.safeParse(body);

  if (!validation.success) {
    return error(
      validation.error.errors.map((e) => e.message).join(', '),
      400,
    ) as APIGatewayProxyResult;
  }

  const { refreshToken } = validation.data;
  logger.info('Token refresh attempt', { action: 'refresh' });

  const command = new InitiateAuthCommand({
    ClientId: CLIENT_ID,
    AuthFlow: 'REFRESH_TOKEN_AUTH' as AuthFlowType,
    AuthParameters: {
      REFRESH_TOKEN: refreshToken,
    },
  });

  const response = await cognitoClient.send(command);
  const result = response.AuthenticationResult;

  if (!result) {
    return error('Token refresh failed', 401) as APIGatewayProxyResult;
  }

  logger.info('Token refresh successful', { action: 'refresh' });

  return success({
    accessToken: result.AccessToken ?? '',
    idToken: result.IdToken ?? '',
    expiresIn: result.ExpiresIn ?? 3600,
  }) as APIGatewayProxyResult;
}

async function handleForgotPassword(
  event: APIGatewayProxyEvent,
  logger: ReturnType<typeof createLogger>,
): Promise<APIGatewayProxyResult> {
  const body = parseBody(event.body);
  const validation = ForgotPasswordSchema.safeParse(body);

  if (!validation.success) {
    return error(
      validation.error.errors.map((e) => e.message).join(', '),
      400,
    ) as APIGatewayProxyResult;
  }

  const { email } = validation.data;
  logger.info('Forgot password request', { action: 'forgot-password' });

  // Always report the same outcome, whether or not the address has an account.
  // Surfacing UserNotFoundException here would let anyone test which email
  // addresses are registered.
  try {
    await forgotPassword(email);
    logger.info('Forgot password code sent', { action: 'forgot-password' });
  } catch (err: unknown) {
    const name = (err as { name?: string })?.name;

    if (name === 'UserNotFoundException' || name === 'InvalidParameterException') {
      // InvalidParameterException also covers "no verified email on the account",
      // which is equally not something to disclose.
      logger.info('Forgot password request for unusable account', {
        action: 'forgot-password',
        reason: name,
      });
    } else {
      throw err;
    }
  }

  return success({
    message: 'If an account exists for that email address, a reset code has been sent.',
  }) as APIGatewayProxyResult;
}

async function handleConfirmForgotPassword(
  event: APIGatewayProxyEvent,
  logger: ReturnType<typeof createLogger>,
): Promise<APIGatewayProxyResult> {
  const body = parseBody(event.body);
  const validation = ConfirmForgotPasswordSchema.safeParse(body);

  if (!validation.success) {
    return error(
      validation.error.errors.map((e) => e.message).join(', '),
      400,
    ) as APIGatewayProxyResult;
  }

  const { email, confirmationCode, newPassword } = validation.data;
  logger.info('Confirm forgot password attempt', { action: 'confirm-forgot-password' });

  await confirmForgotPassword(email, confirmationCode, newPassword);

  logger.info('Password reset confirmed', { action: 'confirm-forgot-password' });

  return success({
    message: 'Password reset successfully',
  }) as APIGatewayProxyResult;
}

async function handleExport(
  event: APIGatewayProxyEvent,
  logger: ReturnType<typeof createLogger>,
): Promise<APIGatewayProxyResult> {
  // Authenticate user
  const claims = authenticateRequest(event as any);
  if (!claims) {
    // Fall back to demo user in local mode
    if (process.env.STAGE === 'local') {
      const userId = 'demo-user-001';
      return await exportUserData(userId, logger);
    }
    return error('Unauthorized', 401) as APIGatewayProxyResult;
  }

  return await exportUserData(claims.userId, logger);
}

async function exportUserData(
  userId: string,
  logger: ReturnType<typeof createLogger>,
): Promise<APIGatewayProxyResult> {
  logger.info('Data export request', { action: 'export', userId });

  const allInvoices: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await queryItems({
      pk: buildPK(userId),
      skPrefix: 'INV#',
      limit: 100,
      startKey: lastKey,
    });

    allInvoices.push(...result.items);
    lastKey = result.lastKey;
  } while (lastKey);

  logger.info('Data export complete', {
    action: 'export',
    userId,
    invoiceCount: allInvoices.length,
  });

  return success({
    userId,
    exportDate: new Date().toISOString(),
    invoiceCount: allInvoices.length,
    invoices: allInvoices,
  }) as APIGatewayProxyResult;
}

async function handleDeleteAccount(
  event: APIGatewayProxyEvent,
  logger: ReturnType<typeof createLogger>,
): Promise<APIGatewayProxyResult> {
  // KNOWN LIMITATION (demo): Deletion order is data-first, then Cognito user.
  // If Cognito deletion fails after data is removed, the user can still authenticate
  // but has no data. In production, reverse the order (delete Cognito first) or use
  // a transaction log for reliable cleanup.

  // Authenticate user
  const claims = authenticateRequest(event as any);
  if (!claims) {
    if (process.env.STAGE === 'local') {
      return error('Account deletion disabled in local mode', 403) as APIGatewayProxyResult;
    }
    return error('Unauthorized', 401) as APIGatewayProxyResult;
  }

  const userId = claims.userId;
  logger.info('Account deletion request', { action: 'delete-account', userId });

  // Step 1: Delete all user invoices from DynamoDB
  let lastKey: Record<string, unknown> | undefined;
  let deletedInvoices = 0;

  do {
    const result = await queryItems({
      pk: buildPK(userId),
      skPrefix: 'INV#',
      limit: 25,
      startKey: lastKey,
    });

    for (const item of result.items) {
      await deleteItem(
        item['PK'] as string,
        item['SK'] as string,
      );
      deletedInvoices++;
    }

    lastKey = result.lastKey;
  } while (lastKey);

  logger.info('Deleted user invoices', {
    action: 'delete-account',
    userId,
    deletedInvoices,
  });

  // Step 2: Delete S3 objects under user prefix
  try {
    await deleteUserS3Objects(userId, logger);
  } catch (err) {
    logger.error('Failed to delete S3 objects', err, { userId });
    // Continue with account deletion even if S3 cleanup fails
  }

  // Step 3: Delete user from Cognito
  try {
    await adminDeleteUser(claims.email || userId);
    logger.info('Deleted Cognito user', { action: 'delete-account', userId });
  } catch (err) {
    logger.error('Failed to delete Cognito user', err, { userId });
    // Continue - user data has been deleted
  }

  logger.info('Account deletion complete', { action: 'delete-account', userId });

  return success({
    message: 'Account deleted successfully',
    deletedInvoices,
  }) as APIGatewayProxyResult;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function deleteUserS3Objects(
  userId: string,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  const prefix = `users/${userId}/`;
  let continuationToken: string | undefined;

  do {
    const listCommand = new ListObjectsV2Command({
      Bucket: DOCUMENTS_BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });

    const listResponse = await s3Client.send(listCommand);
    const objects = listResponse.Contents;

    if (objects && objects.length > 0) {
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: DOCUMENTS_BUCKET,
        Delete: {
          Objects: objects.map((obj) => ({ Key: obj.Key })),
          Quiet: true,
        },
      });

      await s3Client.send(deleteCommand);
      logger.info('Deleted S3 objects batch', {
        action: 'delete-account',
        count: objects.length,
      });
    }

    continuationToken = listResponse.NextContinuationToken;
  } while (continuationToken);
}

function parseBody(body: string | null): unknown {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}
