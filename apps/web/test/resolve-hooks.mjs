/**
 * `loader.mjs` 注册的解析钩子本体（单独一个文件是因为 `register()` 要的是一个模块 URL）。
 *
 * 两条规则，只补 node 缺的那部分：
 * 1. `$lib/x` → 应用源码的 `../src/lib/x`（SvelteKit 别名）；
 * 2. 相对/文件路径解析失败时，依次补 `.ts` 与 `/index.ts`（应用源码省略扩展名）。
 *
 * 先原样交给 `next()`：能解析的一律不动，所以显式写 `./x.ts` 的老测试（引擎、mcp 包风格）
 * 走的是原生那条路。
 */
const LIB = new URL('../src/lib/', import.meta.url);

export async function resolve(specifier, context, next) {
  const mapped = specifier.startsWith('$lib/')
    ? new URL(specifier.slice('$lib/'.length), LIB).href
    : specifier;
  try {
    return await next(mapped, context);
  } catch (error) {
    if (!mapped.startsWith('.') && !mapped.startsWith('file:')) throw error;
    for (const suffix of ['.ts', '/index.ts']) {
      try {
        return await next(mapped + suffix, context);
      } catch {
        // 换下一个候选；全试完仍失败就抛最初那个错
      }
    }
    throw error;
  }
}
