# GitHub Actions OIDC Setup (AWS)

Use these steps to create deploy roles for repository `codekansas/lloyds`.

## Current status (2026-02-22)
- OIDC provider exists:
  - `arn:aws:iam::752725527807:oidc-provider/token.actions.githubusercontent.com`
- Deploy roles provisioned:
  - Staging: `arn:aws:iam::752725527807:role/lloyds-staging-github-actions`
  - Production: `arn:aws:iam::752725527807:role/lloyds-production-github-actions`
- GitHub workflow files are currently hardcoded to these role ARNs and environment targets.

## 1) Ensure GitHub OIDC provider exists
```bash
AWS_PROFILE=professional aws iam list-open-id-connect-providers
```

If missing `token.actions.githubusercontent.com`, create it:
```bash
AWS_PROFILE=professional aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

## 2) Create trust policies
Staging (`master` branch):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:codekansas/lloyds:ref:refs/heads/master"
        }
      }
    }
  ]
}
```

Production (tags `v*`):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:codekansas/lloyds:ref:refs/tags/v*"
        }
      }
    }
  ]
}
```

## 3) Attach deploy policy
Attach an IAM policy permitting:
- ECR push/pull for environment repository
- ECS describe/register/update for environment cluster/service/task definitions
- CloudWatch logs read as needed
- IAM `PassRole` for ECS task execution/task roles

Use separate roles per environment.

If you later switch workflows back to repository settings, store role ARNs as:
- `AWS_ROLE_ARN_STAGING`
- `AWS_ROLE_ARN_PRODUCTION`
