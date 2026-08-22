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
