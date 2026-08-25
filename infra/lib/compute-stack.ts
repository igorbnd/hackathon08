import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { Construct } from 'constructs';

export interface ComputeStackProps extends cdk.StackProps {
  stage: string;
  table: dynamodb.ITable;
  documentsBucket: s3.IBucket;
  httpApi: apigatewayv2.CfnApi;
}

export class ComputeStack extends cdk.Stack {
  public readonly authFunction: lambdaNode.NodejsFunction;
  public readonly ingestionFunction: lambdaNode.NodejsFunction;
  public readonly queryFunction: lambdaNode.NodejsFunction;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const { stage, table, documentsBucket, httpApi } = props;

    // Dead Letter Queues
    const authDlq = new sqs.Queue(this, 'AuthDLQ', {
      queueName: `invoiceiq-${stage}-auth-dlq`,
      retentionPeriod: cdk.Duration.days(14),
    });

    const ingestionDlq = new sqs.Queue(this, 'IngestionDLQ', {
      queueName: `invoiceiq-${stage}-ingestion-dlq`,
      retentionPeriod: cdk.Duration.days(14),
    });

    const queryDlq = new sqs.Queue(this, 'QueryDLQ', {
      queueName: `invoiceiq-${stage}-query-dlq`,
      retentionPeriod: cdk.Duration.days(14),
    });

    // Auth Lambda
    this.authFunction = new lambdaNode.NodejsFunction(this, 'AuthFunction', {
      functionName: `invoiceiq-${stage}-auth`,
      entry: '../api/src/handlers/auth/index.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        TABLE_NAME: table.tableName,
        DOCUMENTS_BUCKET: documentsBucket.bucketName,
        USER_POOL_ID: cdk.Fn.importValue(`invoiceiq-${stage}-user-pool-id`),
        USER_POOL_CLIENT_ID: cdk.Fn.importValue(`invoiceiq-${stage}-user-pool-client-id`),
        STAGE: stage,
      },
      deadLetterQueue: authDlq,
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    this.authFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:PutItem',
          'dynamodb:GetItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:Query',
        ],
        resources: [table.tableArn, `${table.tableArn}/index/*`],
      }),
    );

    this.authFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'cognito-idp:SignUp',
          'cognito-idp:InitiateAuth',
          'cognito-idp:ConfirmSignUp',
          'cognito-idp:ForgotPassword',
          'cognito-idp:ConfirmForgotPassword',
          'cognito-idp:GlobalSignOut',
          'cognito-idp:AdminGetUser',
          'cognito-idp:AdminDeleteUser',
        ],
        resources: [`arn:aws:cognito-idp:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:userpool/*`],
      }),
    );

    this.authFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:ListBucket', 's3:DeleteObject'],
        resources: [documentsBucket.bucketArn, `${documentsBucket.bucketArn}/*`],
      }),
    );

    // Ingestion Lambda
    this.ingestionFunction = new lambdaNode.NodejsFunction(this, 'IngestionFunction', {
      functionName: `invoiceiq-${stage}-ingestion`,
      entry: '../api/src/handlers/ingestion/index.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(60),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        TABLE_NAME: table.tableName,
        DOCUMENTS_BUCKET: documentsBucket.bucketName,
        STAGE: stage,
      },
      deadLetterQueue: ingestionDlq,
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    this.ingestionFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
        resources: [`${documentsBucket.bucketArn}/*`],
      }),
    );

    this.ingestionFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:ListBucket'],
        resources: [documentsBucket.bucketArn],
      }),
    );

    this.ingestionFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['kms:GenerateDataKey', 'kms:Decrypt', 'kms:Encrypt'],
        resources: ['*'],
      }),
    );

    this.ingestionFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['textract:AnalyzeExpense', 'textract:GetExpenseAnalysis'],
        resources: ['*'],
      }),
    );

    this.ingestionFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: ['*'],
      }),
    );

    this.ingestionFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:PutItem',
          'dynamodb:GetItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:Query',
        ],
        resources: [table.tableArn, `${table.tableArn}/index/*`],
      }),
    );

    // Query Lambda
    this.queryFunction = new lambdaNode.NodejsFunction(this, 'QueryFunction', {
      functionName: `invoiceiq-${stage}-query`,
      entry: '../api/src/handlers/query/index.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        TABLE_NAME: table.tableName,
        DOCUMENTS_BUCKET: documentsBucket.bucketName,
        STAGE: stage,
      },
      deadLetterQueue: queryDlq,
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    this.queryFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [`${documentsBucket.bucketArn}/*`],
      }),
    );

    this.queryFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:Query'],
        resources: [table.tableArn, `${table.tableArn}/index/*`],
      }),
    );

    this.queryFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: ['*'],
      }),
    );

    // API Gateway integrations
    const authIntegration = new apigatewayv2.CfnIntegration(this, 'AuthIntegration', {
      apiId: httpApi.ref,
      integrationType: 'AWS_PROXY',
      integrationUri: this.authFunction.functionArn,
      payloadFormatVersion: '2.0',
    });

    const ingestionIntegration = new apigatewayv2.CfnIntegration(this, 'IngestionIntegration', {
      apiId: httpApi.ref,
      integrationType: 'AWS_PROXY',
      integrationUri: this.ingestionFunction.functionArn,
      payloadFormatVersion: '2.0',
    });

    const queryIntegration = new apigatewayv2.CfnIntegration(this, 'QueryIntegration', {
      apiId: httpApi.ref,
      integrationType: 'AWS_PROXY',
      integrationUri: this.queryFunction.functionArn,
      payloadFormatVersion: '2.0',
    });

    // Routes - Auth
    new apigatewayv2.CfnRoute(this, 'AuthRoute', {
      apiId: httpApi.ref,
      routeKey: 'POST /auth/{proxy+}',
      target: `integrations/${authIntegration.ref}`,
    });

    // Routes - Ingestion
    new apigatewayv2.CfnRoute(this, 'UploadRoute', {
      apiId: httpApi.ref,
      routeKey: 'POST /invoices/upload',
      target: `integrations/${ingestionIntegration.ref}`,
    });

    new apigatewayv2.CfnRoute(this, 'ProcessRoute', {
      apiId: httpApi.ref,
      routeKey: 'POST /invoices/{id}/process',
      target: `integrations/${ingestionIntegration.ref}`,
    });

    new apigatewayv2.CfnRoute(this, 'DeleteInvoiceRoute', {
      apiId: httpApi.ref,
      routeKey: 'DELETE /invoices/{id}',
      target: `integrations/${ingestionIntegration.ref}`,
    });

    // Routes - Query
    new apigatewayv2.CfnRoute(this, 'ListInvoicesRoute', {
      apiId: httpApi.ref,
      routeKey: 'GET /invoices',
      target: `integrations/${queryIntegration.ref}`,
    });

    new apigatewayv2.CfnRoute(this, 'GetInvoiceRoute', {
      apiId: httpApi.ref,
      routeKey: 'GET /invoices/{id}',
      target: `integrations/${queryIntegration.ref}`,
    });

    new apigatewayv2.CfnRoute(this, 'GetInvoiceStatusRoute', {
      apiId: httpApi.ref,
      routeKey: 'GET /invoices/{id}/status',
      target: `integrations/${ingestionIntegration.ref}`,
    });

    new apigatewayv2.CfnRoute(this, 'UpdateInvoiceStatusRoute', {
      apiId: httpApi.ref,
      routeKey: 'POST /invoices/{id}/status',
      target: `integrations/${ingestionIntegration.ref}`,
    });

    new apigatewayv2.CfnRoute(this, 'QueryRoute', {
      apiId: httpApi.ref,
      routeKey: 'POST /query',
      target: `integrations/${queryIntegration.ref}`,
    });

    // Grant API Gateway permission to invoke Lambda functions
    this.authFunction.addPermission('ApiGatewayInvoke', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:${httpApi.ref}/*`,
    });

    this.ingestionFunction.addPermission('ApiGatewayInvoke', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:${httpApi.ref}/*`,
    });

    this.queryFunction.addPermission('ApiGatewayInvoke', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:${httpApi.ref}/*`,
    });

    // Expose Cognito IDs (imported from external stack) as CfnOutputs
    // so that generate-config.sh can read them for runtime config generation.
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: cdk.Fn.importValue(`invoiceiq-${stage}-user-pool-id`),
      description: 'Cognito User Pool ID (imported from external stack)',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: cdk.Fn.importValue(`invoiceiq-${stage}-user-pool-client-id`),
      description: 'Cognito User Pool Client ID (imported from external stack)',
    });
  }
}
