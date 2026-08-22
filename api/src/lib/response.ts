import type { APIGatewayProxyResultV2 } from 'aws-lambda';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
  'Content-Type': 'application/json',
};

/**
 * Create a successful JSON response with CORS headers.
 */
export function success(
  body: unknown,
  statusCode: number = 200,
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

/**
 * Create an error JSON response with CORS headers.
 */
export function error(
  message: string,
  statusCode: number = 500,
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: message }),
  };
}

/**
 * Create an OPTIONS preflight response for CORS.
 */
export function corsPreflightResponse(): APIGatewayProxyResultV2 {
  return {
    statusCode: 204,
    headers: CORS_HEADERS,
    body: '',
  };
}

export { CORS_HEADERS };
