# Crew Platform interface and local service

Vue supplies the interface; Bun serves the local API and built frontend. Python remains the software workflow coordinator.

From this folder, use `bun run build`, then `bun run server/index.ts`. The Windows launcher at the repository root opens http://127.0.0.1:4620.

Use the [User's Manual](../docs/users-manual/index.html), [Learner's Manual](../docs/learners-manual/index.html), and [implementation status](../docs/CREW_IMPLEMENTATION_STATUS.md).

Core regressions: `bun test test/core.bun.test.ts`. Browser/manual validation: `node scripts/verify-ui.mjs`. The latter uses headless Edge if installed; it does not select the user's default browser. Neither command uses a real model provider. The optional `scripts/verify-router.ts` does and can incur usage; its cap is a reporting threshold, not an exact spending ceiling.
