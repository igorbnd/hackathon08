import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  GlobalSignOutCommand,
  AdminGetUserCommand,
  AdminDeleteUserCommand,
  AdminConfirmSignUpCommand,
  AdminUpdateUserAttributesCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  type AuthFlowType,
} from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient({});

const USER_POOL_ID = process.env.USER_POOL_ID!;
const CLIENT_ID = process.env.USER_POOL_CLIENT_ID!;

export interface SignUpInput {
  email: string;
  password: string;
  name?: string;
}

export interface AuthResult {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
}

export async function signUp(input: SignUpInput): Promise<{ userSub: string; confirmed: boolean }> {
  const command = new SignUpCommand({
    ClientId: CLIENT_ID,
    Username: input.email,
    Password: input.password,
    UserAttributes: [
      { Name: 'email', Value: input.email },
      ...(input.name ? [{ Name: 'name', Value: input.name }] : []),
    ],
  });

  const response = await cognitoClient.send(command);
  return {
    userSub: response.UserSub ?? '',
    confirmed: response.UserConfirmed ?? false,
  };
}

export async function initiateAuth(
  email: string,
  password: string,
): Promise<AuthResult> {
  const command = new InitiateAuthCommand({
    ClientId: CLIENT_ID,
    AuthFlow: 'USER_PASSWORD_AUTH' as AuthFlowType,
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password,
    },
  });

  const response = await cognitoClient.send(command);
  const result = response.AuthenticationResult;

  if (!result) {
    throw new Error('Authentication failed: no result returned');
  }

  return {
    accessToken: result.AccessToken ?? '',
    idToken: result.IdToken ?? '',
    refreshToken: result.RefreshToken ?? '',
    expiresIn: result.ExpiresIn ?? 3600,
  };
}

export async function confirmSignUp(
  email: string,
  confirmationCode: string,
): Promise<void> {
  const command = new ConfirmSignUpCommand({
    ClientId: CLIENT_ID,
    Username: email,
    ConfirmationCode: confirmationCode,
  });

  await cognitoClient.send(command);
}

export interface AdminCreateUserInput {
  email: string;
  password: string;
  name?: string;
}

/**
 * Create an already-confirmed user without Cognito sending any email.
 *
 * WHY NOT THE PUBLIC SignUp API:
 * When a pool has auto-verified attributes, SignUp always emails a verification
 * code and there is no way to suppress it from the API call. Since we confirm the
 * account immediately afterwards, that code is useless — the user receives an
 * email asking them to do something they never need to do.
 * AdminCreateUser with MessageAction 'SUPPRESS' sends nothing at all.
 *
 * WHY THE PASSWORD IS PASSED TWICE:
 * It goes in as TemporaryPassword first so the pool's password policy is
 * enforced BEFORE the user exists. A weak password therefore fails without
 * leaving an orphaned account behind (which would then collide with
 * UsernameExistsException on the user's next attempt). AdminSetUserPassword with
 * Permanent: true then promotes it, moving the user out of
 * FORCE_CHANGE_PASSWORD into CONFIRMED so they can sign in normally.
 *
 * Requires IAM: cognito-idp:AdminCreateUser, cognito-idp:AdminSetUserPassword
 * (and AdminDeleteUser, for the rollback path).
 */
export async function adminCreateConfirmedUser(
  input: AdminCreateUserInput,
): Promise<{ userSub: string }> {
  const created = await cognitoClient.send(
    new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: input.email,
      TemporaryPassword: input.password,
      MessageAction: 'SUPPRESS',
      UserAttributes: [
        { Name: 'email', Value: input.email },
        // Set here rather than patched afterwards: Cognito refuses
        // ForgotPassword without a verified delivery medium.
        { Name: 'email_verified', Value: 'true' },
        ...(input.name ? [{ Name: 'name', Value: input.name }] : []),
      ],
    }),
  );

  try {
    await cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: input.email,
        Password: input.password,
        Permanent: true,
      }),
    );
  } catch (err) {
    // Roll back the half-created user so a retry does not hit
    // UsernameExistsException on an account that cannot be signed into.
    try {
      await cognitoClient.send(
        new AdminDeleteUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: input.email,
        }),
      );
    } catch {
      // Nothing useful to do if cleanup also fails; surface the original error.
    }
    throw err;
  }

  const userSub =
    created.User?.Attributes?.find((a) => a.Name === 'sub')?.Value ?? '';

  return { userSub };
}

/**
 * Confirm a newly signed-up user without requiring an emailed code.
 *
 * Retained for the public SignUp flow; not used by the current signup handler,
 * which creates users via adminCreateConfirmedUser instead.
 * Requires the `cognito-idp:AdminConfirmSignUp` IAM action.
 */
export async function adminConfirmSignUp(username: string): Promise<void> {
  const command = new AdminConfirmSignUpCommand({
    UserPoolId: USER_POOL_ID,
    Username: username,
  });

  await cognitoClient.send(command);
}

/**
 * Mark a user's email as verified.
 *
 * AdminConfirmSignUp confirms the account but leaves `email_verified` false.
 * Cognito refuses ForgotPassword when there is no verified delivery medium, so
 * without this the password-reset flow cannot work.
 * Requires the `cognito-idp:AdminUpdateUserAttributes` IAM action.
 */
export async function adminMarkEmailVerified(username: string): Promise<void> {
  const command = new AdminUpdateUserAttributesCommand({
    UserPoolId: USER_POOL_ID,
    Username: username,
    UserAttributes: [{ Name: 'email_verified', Value: 'true' }],
  });

  await cognitoClient.send(command);
}

export async function forgotPassword(email: string): Promise<void> {
  const command = new ForgotPasswordCommand({
    ClientId: CLIENT_ID,
    Username: email,
  });

  await cognitoClient.send(command);
}

export async function confirmForgotPassword(
  email: string,
  confirmationCode: string,
  newPassword: string,
): Promise<void> {
  const command = new ConfirmForgotPasswordCommand({
    ClientId: CLIENT_ID,
    Username: email,
    ConfirmationCode: confirmationCode,
    Password: newPassword,
  });

  await cognitoClient.send(command);
}

export async function globalSignOut(accessToken: string): Promise<void> {
  const command = new GlobalSignOutCommand({
    AccessToken: accessToken,
  });

  await cognitoClient.send(command);
}

export async function adminGetUser(
  username: string,
): Promise<{ username: string; email?: string; status?: string }> {
  const command = new AdminGetUserCommand({
    UserPoolId: USER_POOL_ID,
    Username: username,
  });

  const response = await cognitoClient.send(command);
  const emailAttr = response.UserAttributes?.find((a) => a.Name === 'email');

  return {
    username: response.Username ?? username,
    email: emailAttr?.Value,
    status: response.UserStatus,
  };
}

export async function adminDeleteUser(username: string): Promise<void> {
  const command = new AdminDeleteUserCommand({
    UserPoolId: USER_POOL_ID,
    Username: username,
  });

  await cognitoClient.send(command);
}

export { cognitoClient, USER_POOL_ID, CLIENT_ID };
