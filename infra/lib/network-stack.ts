import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';

export interface NetworkStackProps extends cdk.StackProps {
  stage: string;
  domainName: string;
  certificateArn: string;
  webAclArn: string;
}

export class NetworkStack extends cdk.Stack {
  public readonly httpApi: cdk.aws_apigatewayv2.CfnApi;
  public readonly httpApiStage: cdk.aws_apigatewayv2.CfnStage;
  public readonly distribution: cloudfront.Distribution;
  public readonly apiEndpoint: string;
  public readonly distributionDomainName: string;
  public readonly spaBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { stage, domainName, certificateArn, webAclArn } = props;

    // SPA S3 bucket (lives here to avoid cross-stack circular dependency with CloudFront OAC)
    this.spaBucket = new s3.Bucket(this, 'SpaBucket', {
      bucketName: `invoiceiq-${stage}-spa-${cdk.Aws.ACCOUNT_ID}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const spaBucket = this.spaBucket;

    // HTTP API (API Gateway V2)
    this.httpApi = new cdk.aws_apigatewayv2.CfnApi(this, 'HttpApi', {
      name: `invoiceiq-${stage}-api`,
      protocolType: 'HTTP',
      corsConfiguration: {
        allowOrigins: [`https://${domainName}`, 'http://localhost:5173'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date', 'X-Api-Key'],
        maxAge: 86400,
      },
    });

    this.httpApiStage = new cdk.aws_apigatewayv2.CfnStage(this, 'HttpApiStage', {
      apiId: this.httpApi.ref,
      stageName: '$default',
      autoDeploy: true,
      defaultRouteSettings: {
        throttlingBurstLimit: 1000,
        throttlingRateLimit: 500,
      },
    });

    this.apiEndpoint = `https://${this.httpApi.ref}.execute-api.${cdk.Aws.REGION}.amazonaws.com`;

    // Import the ACM certificate from us-east-1 (cross-region)
    const certificate = acm.Certificate.fromCertificateArn(
      this,
      'ImportedCertificate',
      certificateArn,
    );

    // CloudFront Origin Access Control
    const oac = new cloudfront.S3OriginAccessControl(this, 'OAC', {
      signing: cloudfront.Signing.SIGV4_NO_OVERRIDE,
    });

    // Response Headers Policy with security headers
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
      this,
      'SecurityHeadersPolicy',
      {
        responseHeadersPolicyName: `invoiceiq-${stage}-security-headers`,
        securityHeadersBehavior: {
          strictTransportSecurity: {
            accessControlMaxAge: cdk.Duration.seconds(63072000),
            includeSubdomains: true,
            preload: true,
            override: true,
          },
          contentTypeOptions: {
            override: true,
          },
          referrerPolicy: {
            referrerPolicy:
              cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
            override: true,
          },
          contentSecurityPolicy: {
            contentSecurityPolicy: [
              "default-src 'self'",
              "script-src 'self'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "font-src 'self'",
              "connect-src 'self' https://cognito-idp.*.amazonaws.com https://*.auth.*.amazoncognito.com",
              "frame-ancestors 'none'",
              // NOTE: form-action 'self' will block Cognito hosted UI redirects if
              // the app ever switches to the OAuth redirect flow. Currently auth is
              // handled via XHR to /api/auth/* so this is not triggered. If hosted UI
              // is adopted, add https://*.auth.*.amazoncognito.com to form-action.
              "form-action 'self'",
            ].join('; '),
            override: true,
          },
        },
        customHeadersBehavior: {
          customHeaders: [
            {
              header: 'Permissions-Policy',
              value: 'camera=(), microphone=(), geolocation=(), payment=()',
              override: true,
            },
          ],
        },
      },
    );

    // API Gateway origin for /api/* behavior
    const apiOrigin = new origins.HttpOrigin(
      `${this.httpApi.ref}.execute-api.${cdk.Aws.REGION}.amazonaws.com`,
      {
        protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      },
    );

    // Use AWS managed CachingDisabled policy (no caching for API)
    const apiCachePolicy = cloudfront.CachePolicy.CACHING_DISABLED;

    // Use AWS managed AllViewerExceptHostHeader policy to forward all headers
    // (including Authorization) to the API Gateway origin
    const apiOriginRequestPolicy = cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER;

    // CloudFront Function to strip /api prefix before forwarding to API Gateway
    const apiPathRewriteFunction = new cloudfront.Function(
      this,
      'ApiPathRewriteFunction',
      {
        functionName: `invoiceiq-${stage}-api-path-rewrite`,
        code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  request.uri = request.uri.replace(/^\\/api/, '');
  if (request.uri === '') {
    request.uri = '/';
  }
  return request;
}
`),
      },
    );

    // CloudFront distribution
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(spaBucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
        responseHeadersPolicy,
      },
      additionalBehaviors: {
        'api/*': {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: apiCachePolicy,
          originRequestPolicy: apiOriginRequestPolicy,
          functionAssociations: [
            {
              function: apiPathRewriteFunction,
              eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ],
        },
      },
      domainNames: [domainName],
      certificate,
      defaultRootObject: 'index.html',
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      enableIpv6: true,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      webAclId: webAclArn,
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });

    this.distributionDomainName = this.distribution.distributionDomainName;

    // Outputs
    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description:
        'CloudFront distribution domain name. Point your CNAME to this value in Cloudflare (DNS only, proxy OFF).',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID for cache invalidation',
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.apiEndpoint,
      description: 'HTTP API Gateway endpoint (accessed via CloudFront /api/*)',
    });

    new cdk.CfnOutput(this, 'CustomDomain', {
      value: `https://${domainName}`,
      description: 'Custom domain URL',
    });

    new cdk.CfnOutput(this, 'SpaBucketName', {
      value: this.spaBucket.bucketName,
      description: 'SPA hosting bucket name',
    });
  }
}
