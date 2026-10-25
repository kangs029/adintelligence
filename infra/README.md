# XPAT Ads Pipeline — AWS Infrastructure

CloudFormation stack for the xpat-ads pipeline.
Provisions two S3 buckets, a scheduled Lambda function, Secrets Manager credentials store, IAM roles, and a CloudWatch error alarm.

## Architecture

```
EventBridge Scheduler (default: every 30 days, configurable)
        │
        ▼
Lambda — xpat-ads-pipeline (Node.js 22.x)
  reads  ──► Secrets Manager  (xpat/ads/credentials)
  writes ──► S3 xpat-ads-raw-{accountId}
                meta/YYYY-MM-DD/raw.json
                google/YYYY-MM-DD/raw.json
  writes ──► S3 xpat-ads-normalized-{accountId}
                xpat-ad-performance.json
        │
        ▼
CloudWatch Logs + Error Alarm
```

The Next.js app reads `xpat-ad-performance.json` from the normalized bucket via the AWS SDK.

---

## Prerequisites

- AWS CLI configured with the XPAT account (`kangkana`, account `345692661102`)
- Node.js 22.x installed locally
- `pnpm` installed

```bash
aws sts get-caller-identity  # Should show account 345692661102
```

---

## Step 1 — Deploy the CloudFormation stack

```bash
aws cloudformation deploy \
  --template-file infra/cloudformation.yaml \
  --stack-name xpat-ads-pipeline \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1 \
  --parameter-overrides PipelineSchedule="rate(30 days)"
```

To change the schedule (e.g. every 6 hours):

```bash
aws cloudformation deploy \
  --template-file infra/cloudformation.yaml \
  --stack-name xpat-ads-pipeline \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1 \
  --parameter-overrides PipelineSchedule="rate(6 hours)"
```

---

## Step 2 — Set the API credentials in Secrets Manager

After the stack is created, populate the secret with real values.
Get the secret ARN from the stack outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name xpat-ads-pipeline \
  --query "Stacks[0].Outputs[?OutputKey=='SecretArn'].OutputValue" \
  --output text \
  --region us-east-1
```

Then update the secret (replace values from .env.local):

```bash
aws secretsmanager put-secret-value \
  --secret-id xpat/ads/credentials \
  --region us-east-1 \
  --secret-string '{
    "META_ACCESS_TOKEN": "YOUR_VALUE",
    "META_APP_ID": "YOUR_VALUE",
    "META_APP_SECRET": "YOUR_VALUE",
    "META_AD_ACCOUNT_ID": "YOUR_VALUE",
    "GOOGLE_ADS_DEVELOPER_TOKEN": "YOUR_VALUE",
    "GOOGLE_ADS_CLIENT_ID": "YOUR_VALUE",
    "GOOGLE_ADS_CLIENT_SECRET": "YOUR_VALUE",
    "GOOGLE_ADS_CUSTOMER_ID": "YOUR_VALUE",
    "GOOGLE_ADS_REFRESH_TOKEN": "YOUR_VALUE",
    "GOOGLE_ADS_LOGIN_CUSTOMER_ID": "YOUR_VALUE"
  }'
```

---

## Step 3 — Build and deploy the Lambda ZIP

The Lambda runs the pipeline code directly from the repo. Bundle it and upload:

```bash
# From the repo root (xpat-os/)

# Install dependencies
pnpm install

# Create the Lambda ZIP
# Include: infra/lambda/, pipeline/xpat-ads/, pipeline/lib/, node_modules/
mkdir -p infra/lambda/dist

zip -r infra/lambda/dist/xpat-ads-pipeline.zip \
  infra/lambda/handler.mjs \
  pipeline/xpat-ads/ \
  pipeline/lib/ \
  node_modules/@aws-sdk/client-s3 \
  node_modules/@aws-sdk/client-secrets-manager \
  node_modules/@aws-sdk/smithy-client \
  node_modules/@smithy

# Upload to Lambda
aws lambda update-function-code \
  --function-name xpat-ads-pipeline \
  --zip-file fileb://infra/lambda/dist/xpat-ads-pipeline.zip \
  --region us-east-1
```

> Note: On Windows, use 7-Zip or PowerShell Compress-Archive instead of `zip`.
> See the PowerShell section below.

### Windows PowerShell alternative

```powershell
# From the repo root
$files = @(
  "infra\lambda\handler.mjs",
  "pipeline\xpat-ads",
  "pipeline\lib"
)

Compress-Archive -Path $files -DestinationPath infra\lambda\dist\xpat-ads-pipeline.zip -Force

# Note: node_modules must be added separately — Compress-Archive handles directories
# Consider using 7-Zip for a full bundle:
# 7z a infra\lambda\dist\xpat-ads-pipeline.zip infra\lambda\handler.mjs pipeline\xpat-ads\ pipeline\lib\ node_modules\@aws-sdk\

aws lambda update-function-code `
  --function-name xpat-ads-pipeline `
  --zip-file fileb://infra/lambda/dist/xpat-ads-pipeline.zip `
  --region us-east-1
```

---

## Step 4 — Test the Lambda manually

Invoke the function once without waiting for the schedule:

```bash
aws lambda invoke \
  --function-name xpat-ads-pipeline \
  --region us-east-1 \
  --log-type Tail \
  --query "LogResult" \
  --output text \
  response.json | base64 --decode

cat response.json
```

Expected response:

```json
{
  "statusCode": 200,
  "body": "{\"status\":\"ok\",\"recordCount\":1234,\"metaStatus\":\"ok\",\"googleStatus\":\"ok\",...}"
}
```

---

## Step 5 — Verify S3 output

```bash
# Raw responses
aws s3 ls s3://xpat-ads-raw-345692661102/ --recursive --region us-east-1

# Normalized artifact
aws s3 ls s3://xpat-ads-normalized-345692661102/ --region us-east-1

# Download and inspect the normalized artifact
aws s3 cp s3://xpat-ads-normalized-345692661102/xpat-ad-performance.json - \
  --region us-east-1 | head -50
```

---

## Monitoring

- **CloudWatch Logs**: `/aws/lambda/xpat-ads-pipeline` — all pipeline run output
- **Error Alarm**: `xpat-ads-pipeline-errors` — fires if Lambda errors, indicating stale data

View recent log events:

```bash
aws logs tail /aws/lambda/xpat-ads-pipeline \
  --follow \
  --region us-east-1
```

---

## Updating credentials (e.g. Google Refresh Token rotation)

```bash
# Get current secret value, edit, then put back
aws secretsmanager get-secret-value \
  --secret-id xpat/ads/credentials \
  --region us-east-1 \
  --query SecretString \
  --output text

# Update just the refresh token
aws secretsmanager put-secret-value \
  --secret-id xpat/ads/credentials \
  --region us-east-1 \
  --secret-string '{ ...updated JSON... }'
```

---

## Stack parameters reference

| Parameter | Default | Description |
|---|---|---|
| `PipelineSchedule` | `rate(30 days)` | EventBridge schedule. Any `rate()` or `cron()` expression. |
| `RawRetentionDays` | `90` | Days to keep old raw S3 object versions. |
| `NormalizedRetentionDays` | `30` | Days to keep old normalized S3 object versions. |
| `LogRetentionDays` | `14` | CloudWatch log retention. |
| `LambdaMemoryMB` | `512` | Lambda memory in MB. |
| `LambdaTimeoutSeconds` | `300` | Lambda timeout in seconds. |

---

## Tear down

```bash
# Empty the buckets first (required before CloudFormation can delete them)
aws s3 rm s3://xpat-ads-raw-345692661102 --recursive --region us-east-1
aws s3 rm s3://xpat-ads-normalized-345692661102 --recursive --region us-east-1

# Delete the stack
aws cloudformation delete-stack \
  --stack-name xpat-ads-pipeline \
  --region us-east-1
```
