import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import { Construct } from 'constructs';

export interface CostStackProps extends cdk.StackProps {
  stage: string;
}

export class CostStack extends cdk.Stack {
  public readonly budgetAlertsTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: CostStackProps) {
    super(scope, id, props);

    const { stage } = props;

    // SNS topic for budget alerts
    this.budgetAlertsTopic = new sns.Topic(this, 'BudgetAlertsTopic', {
      topicName: `invoiceiq-${stage}-budget-alerts`,
      displayName: `InvoiceIQ ${stage} Budget Alerts`,
    });

    // Email subscription from CDK context
    const alertEmail = this.node.tryGetContext('alertEmail');
    if (alertEmail) {
      this.budgetAlertsTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(alertEmail),
      );
    }

    // Daily budget: $10 COST budget, notification at 100% actual
    new budgets.CfnBudget(this, 'DailyBudget', {
      budget: {
        budgetName: `invoiceiq-${stage}-daily-budget`,
        budgetType: 'COST',
        timeUnit: 'DAILY',
        budgetLimit: {
          amount: 10,
          unit: 'USD',
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            {
              subscriptionType: 'SNS',
              address: this.budgetAlertsTopic.topicArn,
            },
          ],
        },
      ],
    });

    // Monthly budget: $50 COST budget, notifications at 80% and 100% actual
    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: `invoiceiq-${stage}-monthly-budget`,
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: {
          amount: 50,
          unit: 'USD',
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            {
              subscriptionType: 'SNS',
              address: this.budgetAlertsTopic.topicArn,
            },
          ],
        },
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            {
              subscriptionType: 'SNS',
              address: this.budgetAlertsTopic.topicArn,
            },
          ],
        },
      ],
    });
  }
}
