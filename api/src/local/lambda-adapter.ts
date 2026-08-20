import type { Request, Response } from 'express';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

type LambdaHandler = (
  event: APIGatewayProxyEvent,
  context: Context,
) => Promise<APIGatewayProxyResult>;

export function lambdaAdapter(handler: LambdaHandler) {
  return async (req: Request, res: Response): Promise<void> => {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers[key] = value;
      } else if (Array.isArray(value)) {
        headers[key] = value.join(', ');
      }
    }

    const queryStringParameters: Record<string, string> | null =
      Object.keys(req.query).length > 0
        ? Object.fromEntries(
            Object.entries(req.query).map(([k, v]) => [k, String(v)]),
          )
        : null;

    const event: APIGatewayProxyEvent = {
      httpMethod: req.method,
      path: req.path,
      headers,
      multiValueHeaders: {},
      queryStringParameters,
      multiValueQueryStringParameters: null,
      pathParameters: req.params && Object.keys(req.params).length > 0 ? req.params : null,
      stageVariables: null,
      requestContext: {
        accountId: 'local',
        apiId: 'local',
        authorizer: null,
        protocol: 'HTTP/1.1',
        httpMethod: req.method,
        identity: {
          accessKey: null,
          accountId: null,
          apiKey: null,
          apiKeyId: null,
          caller: null,
          clientCert: null,
          cognitoAuthenticationProvider: null,
          cognitoAuthenticationType: null,
          cognitoIdentityId: null,
          cognitoIdentityPoolId: null,
          principalOrgId: null,
          sourceIp: req.ip || '127.0.0.1',
          user: null,
          userAgent: req.get('user-agent') || null,
          userArn: null,
        },
        path: req.path,
        stage: 'local',
        requestId: `local-${Date.now()}`,
        requestTimeEpoch: Date.now(),
        resourceId: 'local',
        resourcePath: req.path,
      },
      resource: req.path,
      body: req.body ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body)) : null,
      isBase64Encoded: false,
    };

    const context: Context = {
      callbackWaitsForEmptyEventLoop: true,
      functionName: 'local',
      functionVersion: '$LATEST',
      invokedFunctionArn: 'arn:aws:lambda:local:000000000000:function:local',
      memoryLimitInMB: '128',
      awsRequestId: `local-${Date.now()}`,
      logGroupName: '/aws/lambda/local',
      logStreamName: 'local',
      getRemainingTimeInMillis: () => 30000,
      done: () => {},
      fail: () => {},
      succeed: () => {},
    };

    try {
      const result = await handler(event, context);

      if (result.headers) {
        for (const [key, value] of Object.entries(result.headers)) {
          res.setHeader(key, String(value));
        }
      }

      res.status(result.statusCode).send(result.body);
    } catch (error) {
      console.error('Lambda handler error:', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  };
}
