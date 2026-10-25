# AWS Scripts

Helper scripts for managing the xpat-ads-pipeline AWS infrastructure.

## Scripts

| Script | Purpose |
|---|---|
| `populate-secret.mjs` | Load API credentials from `.env.local` into Secrets Manager |
| `deploy-lambda.mjs` | Bundle and upload the Lambda ZIP |
| `invoke-pipeline.mjs` | Manually trigger the Lambda and tail the result |

Run any script with:

```bash
node aws-scripts/<script-name>.mjs
```

Requires AWS CLI configured for account `345692661102` (XPAT) in `us-east-1`.
