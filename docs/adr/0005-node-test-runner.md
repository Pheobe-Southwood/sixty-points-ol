# 引擎测试用 Node 内置 test runner，不用 Vitest

`packages/engine` 的测试跑在 `node --test --test-isolation=none "test/*.test.ts"` 上，配合 Node 的原生 TS 类型擦除（因此引擎内部 import 一律带 `.ts` 后缀，`tsconfig` 打开 `allowImportingTsExtensions`）。原因：Vitest 走 Vite/esbuild，esbuild 需要 spawn 子进程并通过管道通信，在受限沙箱里直接 EPERM；Node 自带 runner 零依赖、无需构建步骤，本地与 CI 都能直接跑。代价：放弃 Vitest 的 watch/断言体验与生态（如快照、覆盖率插件），断言用 `node:assert/strict`。
