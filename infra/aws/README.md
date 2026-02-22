# AWS Deployment Overview

This project is configured for AWS-first hosting and automated deployments.

## Environments
- Staging: `cafestaging.bolte.cc`
- Production: `cafe.bolte.cc`

## Infrastructure
Terraform code lives in `/Users/ben/Github/lloyds/infra/aws/terraform`.

Use the `professional` profile for local applies:
```bash
cd infra/aws/terraform
AWS_PROFILE=professional terraform init
AWS_PROFILE=professional terraform plan -var-file=environments/staging.tfvars -var="openai_api_key=$OPENAI_API_KEY_STAGING"
AWS_PROFILE=professional terraform apply -var-file=environments/staging.tfvars -var="openai_api_key=$OPENAI_API_KEY_STAGING"
```

## Deployment flow
1. Build Docker image from `Dockerfile`.
2. Push image to environment ECR repository.
3. Roll ECS service to a new task definition revision with the new image.
4. Wait for service stabilization.

Script used by CI/CD:
- `/Users/ben/Github/lloyds/scripts/aws/deploy-ecs.sh`
- `/Users/ben/Github/lloyds/scripts/aws/promote-ecr-image.sh`

## GitHub automation
- `ci.yml`: lint, typecheck, and Playwright E2E.
- `deploy-staging.yml`: push to `staging` deploys staging, runs smoke + acceptance gates, and auto-promotes to production.
- `deploy-production.yml`: manual emergency production deploy (workflow dispatch only).
- OIDC roles in AWS:
  - `arn:aws:iam::752725527807:role/lloyds-staging-github-actions`
  - `arn:aws:iam::752725527807:role/lloyds-production-github-actions`
- Workflows are prewired with these role ARNs and target environment values.

## DNS status
Route 53 hosted zone `bolte.cc` exists in account `752725527807`.
Records for `cafestaging.bolte.cc` and `cafe.bolte.cc` are created by Terraform apply.
