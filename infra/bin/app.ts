#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { StorageStack } from '../lib/storage-stack';
import { NetworkStack } from '../lib/network-stack';
import { ComputeStack } from '../lib/compute-stack';
import { ObservabilityStack } from '../lib/observability-stack';
import { CostStack } from '../lib/cost-stack';
import { CertificateStack } from '../lib/certificate-stack';

const app = new cdk.App();
const stage = app.node.tryGetContext('stage') || 'dev';
const domainName = app.node.tryGetContext('domainName');

// NOTE: Cognito User Pool and Client are provisioned separately (not via CDK in
// this repo). The Compute stack imports their IDs via cdk.Fn.importValue and
// re-exports them as CfnOutputs for the generate-config.sh script.

const appEnv: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// CertificateStack deploys to us-east-1 (required for CloudFront ACM + WAF scope CLOUDFRONT)
const certificateStack = new CertificateStack(app, `InvoiceIQ-Certificate-${stage}`, {
  stage,
  domainName,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
  crossRegionReferences: true,
});

const storageStack = new StorageStack(app, `InvoiceIQ-Storage-${stage}`, {
  stage,
  env: appEnv,
});

const networkStack = new NetworkStack(app, `InvoiceIQ-Network-${stage}`, {
  stage,
  domainName,
  certificateArn: certificateStack.certificateArn,
  webAclArn: certificateStack.webAclArn,
  env: appEnv,
  crossRegionReferences: true,
});
networkStack.addDependency(certificateStack);

const computeStack = new ComputeStack(app, `InvoiceIQ-Compute-${stage}`, {
  stage,
  table: storageStack.table,
  documentsBucket: storageStack.documentsBucket,
  httpApi: networkStack.httpApi,
  env: appEnv,
});
computeStack.addDependency(networkStack);
computeStack.addDependency(storageStack);

const observabilityStack = new ObservabilityStack(app, `InvoiceIQ-Observability-${stage}`, {
  stage,
  lambdaFunctions: [
    computeStack.authFunction,
    computeStack.ingestionFunction,
    computeStack.queryFunction,
  ],
  httpApi: networkStack.httpApi,
  tableName: storageStack.table.tableName,
  env: appEnv,
});
observabilityStack.addDependency(computeStack);
observabilityStack.addDependency(networkStack);

const costStack = new CostStack(app, `InvoiceIQ-Cost-${stage}`, {
  stage,
  env: appEnv,
});
