# Lloyd's Coffee House Agent Plan (Living Document)

This file is the execution contract for future agents. Update statuses and decision notes as work lands.

## Update Protocol
- Keep phase checklists accurate.
- Add a short `Decision Log` entry for any architectural deviation.
- Never remove unresolved risks; move them forward explicitly.

## Phase 0: Foundation (Current Sprint)
- [x] Define architecture and plan.
- [x] Add Playwright end-to-end coverage for core member journeys.
- [x] Add AWS ECS/ECR/Route53/ACM/EventBridge deployment scaffolding.
- [x] Configure production database and secrets in deployment environment.
- [x] Add staged release pipeline with staging smoke checks, acceptance gates, and automatic production promotion.
- [ ] Add baseline observability (error tracking + request/job logging).
- [ ] Add rate limits to write-heavy endpoints.

## Phase 1: Feed MVP
- [ ] Seed curated feed sources (LessWrong, Alignment Forum, etc.).
- [ ] Implement RSS ingest and dedupe pipeline.
- [ ] Implement AI summary generation (10-30 second skim format).
- [ ] Implement anonymous submission flow (no karma, no author shown).
- [ ] Add ranking heuristic balancing freshness and substance.

## Phase 2: Identity and Profile Depth
- [ ] Implement OAuth sign-in providers and required scopes.
- [ ] Enforce manifesto acceptance before product access.
- [ ] Expand profile editing and long-form fields.
- [ ] Link user blog RSS and ingest posts as profile signal.
- [ ] Build profile signal extraction (topics and active questions).

## Phase 3: Matching and Scheduling
- [ ] Capture structured availability windows.
- [ ] Capture optional location(s) and mode preferences.
- [ ] Implement compatibility scoring and pair selection.
- [ ] Integrate calendar free/busy checks.
- [ ] Auto-create calendar events for confirmed matches.

## Phase 4: Trust, Safety, and Governance
- [ ] Add reporting/blocking pipeline.
- [ ] Add moderation review queue and action audit log.
- [ ] Add abuse heuristics for spam/scams/extractive behavior.
- [ ] Add policy pages and legal disclaimers.

## Phase 5: Intelligence and Personalization
- [ ] Add semantic indexing for profile/post matching.
- [ ] Personalize feed ranking from explicit interests + behavior.
- [ ] Add reflective prompts for better profile quality.
- [ ] Add agentic curation assistant for source quality control.

## Non-Functional Requirements
- [ ] Performance: p95 feed render under 1.5s (cached).
- [ ] Job reliability: ingestion/summarization/matching idempotent.
- [ ] Security: least-privilege OAuth scopes and secret rotation runbook.
- [ ] Privacy: user export/delete workflows.

## Decision Log
- 2026-02-22: Chose Next.js + Prisma + Auth.js + Vercel Cron for initial MVP velocity.
- 2026-02-22: Pivoted deployment architecture to AWS-native stack (ECS Fargate, ECR, Route53, ACM, EventBridge + Lambda cron triggers) with staging and production environments.
- 2026-02-22: Completed AWS bootstrap/apply for staging + production, deployed live services to `cafestaging.bolte.cc` and `cafe.bolte.cc`, and created GitHub OIDC deploy roles for `master`/`v*` automation.
- 2026-02-22: Switched release policy to staged branch promotion with smoke checks against staging, full acceptance gates, and immutable-image auto-promotion to production.
