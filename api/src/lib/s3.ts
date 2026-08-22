import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({});

const DOCUMENTS_BUCKET = process.env.DOCUMENTS_BUCKET!;

export interface PresignedUrlOptions {
  bucket?: string;
  key: string;
  expiresIn?: number;
  contentType?: string;
}

export async function generatePresignedUploadUrl(
  options: PresignedUrlOptions,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: options.bucket ?? DOCUMENTS_BUCKET,
    Key: options.key,
    ContentType: options.contentType ?? 'application/pdf',
  });

  return getSignedUrl(s3Client, command, {
    expiresIn: options.expiresIn ?? 300,
  });
}

export async function generatePresignedGetUrl(
  options: PresignedUrlOptions,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: options.bucket ?? DOCUMENTS_BUCKET,
    Key: options.key,
  });

  return getSignedUrl(s3Client, command, {
    expiresIn: options.expiresIn ?? 3600,
  });
}

export async function getObject(
  key: string,
  bucket?: string,
): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: bucket ?? DOCUMENTS_BUCKET,
    Key: key,
  });

  const response = await s3Client.send(command);
  const stream = response.Body;

  if (!stream) {
    throw new Error(`Empty response body for key: ${key}`);
  }

  const chunks: Uint8Array[] = [];
  // @ts-expect-error Stream typing varies between environments
  for await (const chunk of stream) {
    chunks.push(chunk as Uint8Array);
  }
  return Buffer.concat(chunks);
}

export async function putObject(
  key: string,
  body: Buffer | string,
  contentType?: string,
  bucket?: string,
): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: bucket ?? DOCUMENTS_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await s3Client.send(command);
}

export { s3Client, DOCUMENTS_BUCKET };
