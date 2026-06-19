# Vendored SDK

`sdk.mjs` and `sdk.d.ts` are vendored from
[opencc-worktree](https://github.com/hotmanxp/openclaude) at
`dist/sdk.mjs` and `src/entrypoints/sdk.d.ts`.

## Sync to latest

```bash
pnpm run sync-sdk
```

This re-runs the upstream build and copies the new dist into `vendor/`.
Commit the result.
