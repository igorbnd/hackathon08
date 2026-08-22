import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { NativeAttributeValue } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const TABLE_NAME = process.env.TABLE_NAME!;

// Single-table key patterns:
// PK: USER#{userId}       SK: INV#{invoiceId}
// GSI1PK: USER#{userId}#VENDOR#{vendor}   GSI1SK: {isoDate}
// GSI2PK: USER#{userId}#DATE             GSI2SK: {isoDate}#{invoiceId}

export function buildPK(userId: string): string {
  return `USER#${userId}`;
}

export function buildSK(invoiceId: string): string {
  return `INV#${invoiceId}`;
}

export function buildGSI1PK(userId: string, vendor: string): string {
  return `USER#${userId}#VENDOR#${vendor}`;
}

export function buildGSI1SK(isoDate: string): string {
  return isoDate;
}

export function buildGSI2PK(userId: string): string {
  return `USER#${userId}#DATE`;
}

export function buildGSI2SK(isoDate: string, invoiceId: string): string {
  return `${isoDate}#${invoiceId}`;
}

export interface PutItemInput {
  item: Record<string, NativeAttributeValue>;
}

export async function putItem(input: PutItemInput): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: input.item,
    }),
  );
}

export interface GetItemInput {
  pk: string;
  sk: string;
}

export async function getItem(
  input: GetItemInput,
): Promise<Record<string, NativeAttributeValue> | undefined> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: input.pk,
        SK: input.sk,
      },
    }),
  );
  return result.Item;
}

export interface QueryItemsInput {
  pk: string;
  skPrefix?: string;
  limit?: number;
  startKey?: Record<string, NativeAttributeValue>;
  scanForward?: boolean;
}

export async function queryItems(input: QueryItemsInput): Promise<{
  items: Record<string, NativeAttributeValue>[];
  lastKey?: Record<string, NativeAttributeValue>;
}> {
  let keyCondition = 'PK = :pk';
  const expressionValues: Record<string, NativeAttributeValue> = {
    ':pk': input.pk,
  };

  if (input.skPrefix) {
    keyCondition += ' AND begins_with(SK, :skPrefix)';
    expressionValues[':skPrefix'] = input.skPrefix;
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: expressionValues,
      Limit: input.limit,
      ExclusiveStartKey: input.startKey,
      ScanIndexForward: input.scanForward ?? false,
    }),
  );

  return {
    items: (result.Items ?? []) as Record<string, NativeAttributeValue>[],
    lastKey: result.LastEvaluatedKey as Record<string, NativeAttributeValue> | undefined,
  };
}

export interface QueryByGSIInput {
  indexName: string;
  pkName: string;
  pkValue: string;
  skName?: string;
  skValue?: string;
  skBetween?: { start: string; end: string };
  limit?: number;
  startKey?: Record<string, NativeAttributeValue>;
  scanForward?: boolean;
}

export async function queryByGSI(input: QueryByGSIInput): Promise<{
  items: Record<string, NativeAttributeValue>[];
  lastKey?: Record<string, NativeAttributeValue>;
}> {
  let keyCondition = `${input.pkName} = :pkVal`;
  const expressionValues: Record<string, NativeAttributeValue> = {
    ':pkVal': input.pkValue,
  };

  if (input.skBetween && input.skName) {
    keyCondition += ` AND ${input.skName} BETWEEN :skStart AND :skEnd`;
    expressionValues[':skStart'] = input.skBetween.start;
    expressionValues[':skEnd'] = input.skBetween.end;
  } else if (input.skValue && input.skName) {
    keyCondition += ` AND begins_with(${input.skName}, :skVal)`;
    expressionValues[':skVal'] = input.skValue;
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: input.indexName,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: expressionValues,
      Limit: input.limit,
      ExclusiveStartKey: input.startKey,
      ScanIndexForward: input.scanForward ?? false,
    }),
  );

  return {
    items: (result.Items ?? []) as Record<string, NativeAttributeValue>[],
    lastKey: result.LastEvaluatedKey as Record<string, NativeAttributeValue> | undefined,
  };
}

export async function deleteItem(pk: string, sk: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk, SK: sk },
    }),
  );
}

export async function updateItem(
  pk: string,
  sk: string,
  updateExpression: string,
  expressionValues: Record<string, NativeAttributeValue>,
  expressionNames?: Record<string, string>,
): Promise<Record<string, NativeAttributeValue> | undefined> {
  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk, SK: sk },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: expressionNames,
      ReturnValues: 'ALL_NEW',
    }),
  );
  return result.Attributes as Record<string, NativeAttributeValue> | undefined;
}

export { docClient, TABLE_NAME };
