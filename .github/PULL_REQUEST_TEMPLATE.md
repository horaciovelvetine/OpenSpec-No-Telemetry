## What this changes

<!-- Describe the fork/runtime problem and the resulting behavior. -->

## Fork guarantees

- [ ] No OpenSpec-owned network or registry behavior was introduced.
- [ ] Publishing and removed repository surfaces remain absent.
- [ ] All supported IDE/tool integrations remain covered.
- [ ] Production dependency changes were reviewed and pinned.

## Verification

<!-- List the exact commands and relevant focused tests. -->

```text
pnpm build
pnpm test
pnpm exec tsc --noEmit
pnpm lint
node fork/audit-network.mjs
```

For packaging changes:

```text
node fork/pack-offline.mjs
node fork/verify-dawn-starter.mjs
```

## Notes

<!-- Scope limits, upstream-sync considerations, and DAWN example impact. -->
