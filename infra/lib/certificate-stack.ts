import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';

export interface CertificateStackProps extends cdk.StackProps {
  stage: string;
  domainName: string;
}

/**
 * CertificateStack deploys to us-east-1.
 *
 * It provisions:
 * 1. An ACM certificate with DNS validation for the custom domain.
 *    The stack will block (CREATE_IN_PROGRESS) until the DNS validation
 *    CNAME record is added in Cloudflare. This is expected behavior.
 * 2. A WAF WebACL with scope CLOUDFRONT (must reside in us-east-1).
 *
 * Both the certificate ARN and WAF WebACL ARN are exported as outputs
 * and passed cross-region to the NetworkStack.
 */
export class CertificateStack extends cdk.Stack {
  public readonly certificateArn: string;
  public readonly webAclArn: string;

  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);

    const { stage, domainName } = props;

    // ACM Certificate with DNS validation
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName,
      validation: acm.CertificateValidation.fromDns(),
    });

    this.certificateArn = certificate.certificateArn;

    // WAF WebACL for CloudFront (scope CLOUDFRONT must be in us-east-1)
    const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: `invoiceiq-${stage}-web-acl`,
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `invoiceiq-${stage}-web-acl`,
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesCommonRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesKnownBadInputsRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWSManagedRulesSQLiRuleSet',
          priority: 3,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesSQLiRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesSQLiRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWSManagedRulesAmazonIpReputationList',
          priority: 4,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesAmazonIpReputationList',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesAmazonIpReputationList',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'RateLimitRule',
          priority: 5,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 2000,
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitRule',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    this.webAclArn = webAcl.attrArn;

    // Outputs for the deployer
    new cdk.CfnOutput(this, 'CertificateArn', {
      value: certificate.certificateArn,
      description: 'ACM certificate ARN (pass to NetworkStack)',
    });

    new cdk.CfnOutput(this, 'WebAclArn', {
      value: webAcl.attrArn,
      description: 'WAF WebACL ARN for CloudFront (pass to NetworkStack)',
    });

    new cdk.CfnOutput(this, 'DnsValidationNote', {
      value: `Add the DNS validation CNAME record in Cloudflare for ${domainName}. Check the ACM console in us-east-1 for the exact CNAME name and value. Set the record to DNS only (grey cloud, proxy OFF). The stack will remain in CREATE_IN_PROGRESS until validation succeeds.`,
      description: 'Instructions for DNS validation',
    });
  }
}
