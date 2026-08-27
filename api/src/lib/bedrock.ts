import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

const bedrockClient = new BedrockRuntimeClient({});

const DEFAULT_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-haiku-4-5-20251001-v1:0';

export interface InvokeModelInput {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  modelId?: string;
}

export interface InvokeModelOutput {
  content: string;
  stopReason: string;
  inputTokens: number;
  outputTokens: number;
}

export async function invokeModel(input: InvokeModelInput): Promise<InvokeModelOutput> {
  const modelId = input.modelId ?? DEFAULT_MODEL_ID;

  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: input.maxTokens ?? 4096,
    temperature: input.temperature ?? 0.1,
    system: input.systemPrompt ?? '',
    messages: [
      {
        role: 'user',
        content: input.prompt,
      },
    ],
  });

  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: new TextEncoder().encode(body),
  });

  const response = await bedrockClient.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));

  return {
    content: responseBody.content?.[0]?.text ?? '',
    stopReason: responseBody.stop_reason ?? 'unknown',
    inputTokens: responseBody.usage?.input_tokens ?? 0,
    outputTokens: responseBody.usage?.output_tokens ?? 0,
  };
}

export { bedrockClient, DEFAULT_MODEL_ID };
