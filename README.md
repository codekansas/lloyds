# Lloyd's Coffee House

AI-powered web application inspired by the original London coffee house: a high-signal place for long-form ideas and high-agency connections.

## What exists in this MVP
- Manifesto-first onboarding gate (required before any product use).
- OAuth sign-in via Auth.js (Google + GitHub).
- Curated feed architecture (RSS ingestion + dedupe).
- AI-generated article summaries designed for ~10-30 second skim.
- Constitution-based AI quality ratings (5-tier Lloyd's scale).
- Anonymous submissions (no karma and no submitter identity in feed UI).
- Rich member profiles (long-form interests/goals/ideas + blog RSS linkage).
- Availability-based matching for conversations.
- Calendar-aware matching with Google Calendar free/busy checks and event insertion.
- Scheduled background jobs behind secret-protected endpoints.
- Full Playwright end-to-end suite.

## Constitutional quality model
- Source of truth: [Lloyd's Constitution gist](https://gist.github.com/codekansas/1f5b9bd7e4ca1332f667f0e04323ee5b)
- AI ratings are constrained to:
  - `Common Rumour`
  - `Merchant's Word`
  - `Captain's Account`
  - `Underwriter's Confidence`
  - `The Lloyd's Assurance`
- Calibration target over large link sets: `20% / 30% / 30% / 15% / 5%` (low to high).
- Feed defaults to links added in the last 24 hours; users can browse older windows or all-time.

## Architecture docs
- `/Users/ben/Github/lloyds/docs/architecture.md`
- `/Users/ben/Github/lloyds/docs/agent-plan.md`
- `/Users/ben/Github/lloyds/docs/development-guide.md`

## Stack
- Next.js 16 + App Router + TypeScript
- Prisma + PostgreSQL
- Auth.js + Prisma Adapter
- OpenAI API (`responses`)
- RSS ingestion (`rss-parser`)
- Google Calendar API (`googleapis`)

## Local setup
1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.example .env
```

3. Set required values in `.env`:
- `DATABASE_URL`
- `AUTH_SECRET`
- OAuth client credentials (`GOOGLE_*`, `GITHUB_*`)
- `APP_ENV` (`development` for local)
- OpenAI key config (pick one pattern):
  - `OPENAI_API_KEY` (single explicit override)
  - `OPENAI_API_KEY_DEVELOPMENT` / `OPENAI_API_KEY_STAGING` / `OPENAI_API_KEY_PRODUCTION`
- `CRON_SECRET`

4. Generate Prisma client and apply schema:
```bash
npm run prisma:generate
npm run prisma:push
```

5. Seed curated feed sources:
```bash
npm run db:seed
```

6. Start dev server:
```bash
npm run dev
```

## Background jobs
Routes are protected by `CRON_SECRET` via `Authorization: Bearer <CRON_SECRET>`.

- `GET/POST /api/jobs/ingest-rss`
- `GET/POST /api/jobs/summarize`
- `GET/POST /api/jobs/match-users`

Example:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/jobs/ingest-rss
```

## End-to-end tests (Playwright)
The suite covers manifesto gating, user session creation, feed/submission, post comments, profile updates, matching, and cron job endpoints.

1. Ensure `DATABASE_URL` points to a dedicated test Postgres database.
2. Install browser binaries once:
```bash
npx playwright install chromium
```
3. Run tests:
```bash
npm run e2e
```

Useful variants:
```bash
npm run e2e:headed
npm run e2e:ui
```

Staging checks (run against deployed staging URL):
```bash
STAGING_BASE_URL=https://cafestaging.bolte.cc npm run e2e:smoke
STAGING_BASE_URL=https://cafestaging.bolte.cc npm run e2e:staging-acceptance
```

## AWS deployment (staging + production)
Deployment is AWS-native and environment-based:

- Staging URL: `cafestaging.bolte.cc`
- Production URL: `cafe.bolte.cc`

### Infrastructure as code
Terraform stack lives in:
- `/Users/ben/Github/lloyds/infra/aws/terraform`

It provisions:
- ECS Fargate service
- ECR repository
- ALB + ACM + Route53 DNS
- Secrets Manager secrets
- EventBridge + Lambda cron trigger for job routes

Apply environments:
```bash
cd infra/aws/terraform
AWS_PROFILE=professional terraform init
AWS_PROFILE=professional terraform apply -var-file=environments/staging.tfvars -var="openai_api_key=$OPENAI_API_KEY_STAGING"
AWS_PROFILE=professional terraform apply -var-file=environments/production.tfvars -var="openai_api_key=$OPENAI_API_KEY_PRODUCTION"
```

### CI/CD automation
GitHub Actions workflows:
- `/.github/workflows/ci.yml` (lint, typecheck, e2e)
- `/.github/workflows/deploy.yml` (CI success on `master` -> deploy staging -> smoke/stability -> acceptance -> auto-promote production)
- `/.github/workflows/deploy-production.yml` (manual emergency production deploy only)
- OIDC setup reference: `/Users/ben/Github/lloyds/infra/aws/github-oidc.md`

ECS deployment helper script:
- `/Users/ben/Github/lloyds/scripts/aws/deploy-ecs.sh`

### GitHub repo configuration
Current workflows are prewired with environment constants and OIDC role ARNs:
- Staging role: `arn:aws:iam::752725527807:role/lloyds-staging-github-actions`
- Production role: `arn:aws:iam::752725527807:role/lloyds-production-github-actions`

No additional GitHub repository variables/secrets are required for deploys.

## Standard release flow (agents)
1. Implement and validate locally (`lint`, `typecheck`, `e2e`).
2. Merge/push to `master`.
3. Wait for `ci.yml` to pass, then watch `deploy.yml` complete all gates.
4. Let automatic promotion deploy production after staging stability and acceptance checks pass.

## Notes for future agents
- Treat `/docs/agent-plan.md` as a living checklist.
- Update the Decision Log whenever architecture changes.
- Do not introduce karma, public submitter attribution, or low-signal growth mechanics.
