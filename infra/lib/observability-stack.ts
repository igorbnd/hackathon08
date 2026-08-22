import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { Construct } from 'constructs';

export interface ObservabilityStackProps extends cdk.StackProps {
  stage: string;
  lambdaFunctions: lambda.IFunction[];
  httpApi: apigatewayv2.CfnApi;
  tableName: string;
}

export class ObservabilityStack extends cdk.Stack {
  public readonly alarmTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    const { stage, lambdaFunctions, httpApi, tableName } = props;

    // SNS topic for alarm notifications
    this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `invoiceiq-${stage}-alarms`,
      displayName: `InvoiceIQ ${stage} Alarms`,
    });

    // Email subscription from CDK context
    const alertEmail = this.node.tryGetContext('alertEmail');
    if (alertEmail) {
      this.alarmTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(alertEmail),
      );
    }

    const snsAction = new cloudwatchActions.SnsAction(this.alarmTopic);

    // Lambda error rate alarms for each function
    for (const fn of lambdaFunctions) {
      const errorsMetric = fn.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      });

      const invocationsMetric = fn.metricInvocations({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      });

      const errorRateAlarm = new cloudwatch.MathExpression({
        expression: '(errors / invocations) * 100',
        usingMetrics: {
          errors: errorsMetric,
          invocations: invocationsMetric,
        },
        period: cdk.Duration.minutes(5),
      }).createAlarm(this, `ErrorRateAlarm-${fn.node.id}`, {
        alarmName: `invoiceiq-${stage}-${fn.node.id}-error-rate`,
        alarmDescription: `Error rate above 1% for ${fn.node.id}`,
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      errorRateAlarm.addAlarmAction(snsAction);
    }

    // API Gateway 5xx alarm
    const api5xxMetric = new cloudwatch.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: '5xx',
      dimensionsMap: {
        ApiId: httpApi.ref,
      },
      period: cdk.Duration.minutes(5),
      statistic: 'Sum',
    });

    const api5xxAlarm = api5xxMetric.createAlarm(this, 'Api5xxAlarm', {
      alarmName: `invoiceiq-${stage}-api-5xx`,
      alarmDescription: 'API Gateway 5xx errors above threshold',
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    api5xxAlarm.addAlarmAction(snsAction);

    // DynamoDB throttle alarm
    const dynamoThrottleMetric = new cloudwatch.Metric({
      namespace: 'AWS/DynamoDB',
      metricName: 'ThrottledRequests',
      dimensionsMap: {
        TableName: tableName,
      },
      period: cdk.Duration.minutes(1),
      statistic: 'Sum',
    });

    const dynamoThrottleAlarm = dynamoThrottleMetric.createAlarm(this, 'DynamoThrottleAlarm', {
      alarmName: `invoiceiq-${stage}-dynamo-throttle`,
      alarmDescription: 'DynamoDB throttled requests detected',
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    dynamoThrottleAlarm.addAlarmAction(snsAction);

    // Textract daily spend alarm
    const textractDailyLimit = this.node.tryGetContext('textractDailyLimit') || 5;
    const textractMetric = new cloudwatch.Metric({
      namespace: 'AWS/Textract',
      metricName: 'ResponseTime',
      period: cdk.Duration.days(1),
      statistic: 'Sum',
    });

    const textractSpendAlarm = textractMetric.createAlarm(this, 'TextractSpendAlarm', {
      alarmName: `invoiceiq-${stage}-textract-daily-spend`,
      alarmDescription: `Textract daily spend exceeds $${textractDailyLimit}`,
      threshold: textractDailyLimit,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    textractSpendAlarm.addAlarmAction(snsAction);

    // Bedrock daily spend alarm
    const bedrockDailyLimit = this.node.tryGetContext('bedrockDailyLimit') || 10;
    const bedrockMetric = new cloudwatch.Metric({
      namespace: 'AWS/Bedrock',
      metricName: 'InvocationCount',
      period: cdk.Duration.days(1),
      statistic: 'Sum',
    });

    const bedrockSpendAlarm = bedrockMetric.createAlarm(this, 'BedrockSpendAlarm', {
      alarmName: `invoiceiq-${stage}-bedrock-daily-spend`,
      alarmDescription: `Bedrock daily spend exceeds $${bedrockDailyLimit}`,
      threshold: bedrockDailyLimit,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    bedrockSpendAlarm.addAlarmAction(snsAction);
  }
}
