# AWS Infrastructure (Terraform)

This stack provisions one environment (`staging` or `production`) for Lloyd's Coffee House on AWS:

- Amazon ECR repository for container images
- Amazon ECS Fargate service + cluster
- Application Load Balancer with HTTPS (ACM certificate)
- Amazon RDS PostgreSQL instance
- Route 53 DNS record for environment domain
- Secrets Manager storage for app secrets
- CloudWatch logs
- EventBridge + Lambda cron trigger for background job endpoints

## Environment domains
- Staging: `cafestaging.bolte.cc`
- Production: `cafe.bolte.cc`

## Prerequisites
- Terraform >= 1.6
- AWS account access (profile `professional` is available locally)
- Existing public Route 53 hosted zone for `bolte.cc`

## Apply staging
```bash
cd infra/aws/terraform
AWS_PROFILE=professional terraform init
AWS_PROFILE=professional terraform apply -var-file=environments/staging.tfvars -var="openai_api_key=$OPENAI_API_KEY_STAGING"
```

## Apply production
```bash
cd infra/aws/terraform
AWS_PROFILE=professional terraform init
AWS_PROFILE=professional terraform apply -var-file=environments/production.tfvars -var="openai_api_key=$OPENAI_API_KEY_PRODUCTION"
```

## Notes
- Replace `auth_secret` and `cron_secret` placeholders in tfvars before apply.
- Pass environment-specific OpenAI API keys at apply time via `-var="openai_api_key=..."` (recommended) instead of committing secrets in tfvars.
- OAuth provider IDs/secrets are optional in Terraform, but required for social login in the app.
- The stack currently assumes default VPC/subnets; move to dedicated private networking in a later hardening pass.
- ECS task definitions read secrets from Secrets Manager, including `DATABASE_URL`, `AUTH_SECRET`, and `CRON_SECRET`.
- Background jobs are invoked by EventBridge schedules that call a Lambda function hitting:
  - `/api/jobs/ingest-rss`
  - `/api/jobs/summarize`
  - `/api/jobs/match-users`

## Useful outputs
After apply, capture these for GitHub Actions repository variables/secrets:
- `ecr_repository_url`
- `ecs_cluster_name`
- `ecs_service_name`
- `ecs_container_name`
- `database_url_secret_arn`
