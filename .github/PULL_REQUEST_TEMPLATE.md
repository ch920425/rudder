## Thinking Path

<!--
  Required. Trace your reasoning from the top of the project down to this
  specific change. Start with what Rudder is, then narrow through the
  subsystem, the problem, and why this PR exists. Use blockquote style.
  Aim for 5–8 steps. See CONTRIBUTING.md for full examples.
-->

> - Rudder orchestrates AI agents for zero-human companies
> - [Which subsystem or capability is involved]
> - [What problem or gap exists]
> - [Why it needs to be addressed]
> - This pull request ...
> - The benefit is ...

## What Changed

<!-- Bullet list of concrete changes. One bullet per logical unit. -->

-

## Verification

<!--
  How can a reviewer confirm this works? Include test commands, manual
  steps, or both. For UI changes, include before/after screenshots.
-->

-

## Product Logic Alignment

<!--
  Required for product, workflow, runtime, CLI, API, or visible UI behavior
  changes. Use `product_doc_impact: none` only when the change has no product
  logic impact and explain why.
-->

- Product docs read:
- Affected contract IDs:
- Product doc impact: updated / none / deferred
- Product doc update authorization or defer link:
- Tests or E2E proving affected contracts:

## Risks

<!--
  What could go wrong? Mention migration safety, breaking changes,
  behavioral shifts, or "Low risk" if genuinely minor.
-->

-

## Checklist

- [ ] I have included a thinking path that traces from project context to this change
- [ ] I have run tests locally and they pass
- [ ] I have added or updated tests where applicable
- [ ] If this change affects the UI, I have included before/after screenshots
- [ ] I have updated relevant documentation to reflect my changes
- [ ] I have run `pnpm product-logic:check` when this change touches product logic or `doc/product/**`
- [ ] I have considered and documented any risks above
- [ ] I will address all Greptile and reviewer comments before requesting merge
