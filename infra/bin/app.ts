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

const storageStack = new StorageStack(app, `InvoiceIQ-Storage-${stage}`);
const networkStack = new NetworkStack(app, `InvoiceIQ-Network-${stage}`);
const computeStack = new ComputeStack(app, `InvoiceIQ-Compute-${stage}`);
const observabilityStack = new ObservabilityStack(app, `InvoiceIQ-Observability-${stage}`);
const costStack = new CostStack(app, `InvoiceIQ-Cost-${stage}`);
