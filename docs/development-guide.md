# Development and Release Guide

This guide is the default operating procedure for future agents.

## 1. Local development workflow

1. Create changes on a feature branch from `staging`.
2. Run local validation before pushing:
   ```bash
   npm run lint
   npm run typecheck
   npm run e2e
   ```
3. If schema changed, also run:
   ```bash
   npm run prisma:push
   ```
4. Verify the feature manually in `npm run dev` when behavior is user-facing.

## 2. Promote code to staging

1. Merge feature work into `staging`.
2. Push `staging` to GitHub.
3. GitHub Actions workflow `/.github/workflows/deploy-staging.yml` runs automatically.

## 3. Automated staging-to-production pipeline

The staging pipeline is intentionally gated and sequential:

1. `deploy_staging`
- Builds the Docker image tagged with the commit SHA.
- Pushes to staging ECR.
- Deploys to staging ECS.

2. `smoke_staging`
- Runs Playwright smoke tests against `https://cafestaging.bolte.cc`.
- Performs repeated `/api/health` checks as a stability window.

3. `acceptance_staging`
- Runs additional Playwright acceptance checks against staging.

4. `acceptance_full`
- Runs the full local acceptance suite (lint, typecheck, and complete Playwright E2E) in CI.

5. `promote_production`
- Promotes the exact tested image manifest from staging ECR to production ECR (immutable artifact promotion).
- Deploys that promoted image to production ECS.

Production promotion only executes when all prior staging and acceptance gates pass.

## 4. Monitoring expectations

After pushing to `staging`, monitor the workflow run until `promote_production` completes. Successful completion means staging was healthy and production was promoted automatically.

## 5. Rollback / emergency path

Use `/.github/workflows/deploy-production.yml` (`workflow_dispatch`) only for manual emergency production deploys. Normal releases should always go through the staging pipeline.
