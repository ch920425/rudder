---
title: Review Feedback And Learning Domain
domain: review-feedback-learning
status: active
coverage: detailed
contract_ids: []
related_code:
  - server/src/routes/issues.mutations.ts
  - server/src/services/issue-review-wakeup.ts
  - server/src/services/runtime-kernel/heartbeat.recovery.ts
  - server/src/services/runtime-kernel/heartbeat.release.ts
related_tests:
  - tests/e2e/issues-reviewer-routing.spec.ts
  - server/src/__tests__/heartbeat-passive-issue-closeout.test.ts
edit_policy: user_confirmed_only
---

# Review Feedback And Learning Domain

## Owns

- Structured review decisions and close-out expectations.
- Feedback capture and future learning-promotion path.
- Governance distinction between work execution, judgment, and durable
  operating improvement.

## Contract Index

- `REVIEW.DECISION.001`: reviewer decisions are structured, commented, and
  route the next actor.
- `REVIEW.CLOSEOUT.001`: issue-backed runs must leave close-out evidence or
  bounded follow-up/review.
- `LEARNING.PROMOTION.001`: feedback becomes better future behavior only
  through an explicit reviewable path.
