#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { StorageStack } from '../lib/storage-stack';
import { NetworkStack } from '../lib/network-stack';
import { ComputeStack } from '../lib/compute-stack';
import { ObservabilityStack } from '../lib/observability-stack';
import { CostStack } from '../lib/cost-stack';

const app = new cdk.App();
const stage = app.node.tryGetContext('stage') || 'dev';

const storageStack = new StorageStack(app, `InvoiceIQ-Storage-${stage}`, {
  stage,
});

const networkStack = new NetworkStack(app, `InvoiceIQ-Network-${stage}`, {
  stage,
  spaBucket: storageStack.spaBucket,
});
networkStack.addDependency(storageStack);

const computeStack = new ComputeStack(app, `InvoiceIQ-Compute-${stage}`, {
  stage,
  table: storageStack.table,
  documentsBucket: storageStack.documentsBucket,
  httpApi: networkStack.httpApi,
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
});
observabilityStack.addDependency(computeStack);
observabilityStack.addDependency(networkStack);

const costStack = new CostStack(app, `InvoiceIQ-Cost-${stage}`, {
  stage,
});
