import {
  TextractClient,
  AnalyzeExpenseCommand,
  type AnalyzeExpenseCommandOutput,
  type ExpenseDocument,
} from '@aws-sdk/client-textract';

const textractClient = new TextractClient({});

export interface AnalyzeExpenseInput {
  /** S3 bucket name containing the document */
  bucket: string;
  /** S3 object key of the document */
  key: string;
}

export interface AnalyzeExpenseFromBytesInput {
  /** Document bytes (PDF, JPEG, PNG, or TIFF) */
  bytes: Uint8Array;
}

export async function analyzeExpense(
  input: AnalyzeExpenseInput,
): Promise<ExpenseDocument[]> {
  const command = new AnalyzeExpenseCommand({
    Document: {
      S3Object: {
        Bucket: input.bucket,
        Name: input.key,
      },
    },
  });

  const response: AnalyzeExpenseCommandOutput = await textractClient.send(command);
  return response.ExpenseDocuments ?? [];
}

export async function analyzeExpenseFromBytes(
  input: AnalyzeExpenseFromBytesInput,
): Promise<ExpenseDocument[]> {
  const command = new AnalyzeExpenseCommand({
    Document: {
      Bytes: input.bytes,
    },
  });

  const response: AnalyzeExpenseCommandOutput = await textractClient.send(command);
  return response.ExpenseDocuments ?? [];
}

export { textractClient };
