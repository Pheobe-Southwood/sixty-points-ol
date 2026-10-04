/**
 * 静态守卫共用的源码扫描：`mcp-guard.test.ts` 与 `bot-guard.test.ts` 都靠它，
 * 所以**两边的盲区必须一起修**（它们原来是各自抄的一份，同一个 bug 也抄了两遍）。
 *
 * 抽取规则要覆盖 import 的**全部**写法，否则白名单形同虚设：
 * - `import x from 'y'` / `import { x } from "y"` —— **单双引号都算**（原来只认单引号）；
 * - `export ... from 'y'`；
 * - 副作用引入 `import 'y'` —— 它没有 `from` 这个词，原来的正则整条漏掉；
 * - 动态 `import('y')` / `await import("y")` —— 同样没有 `from`。
 *
 * 注释会被剥掉（注释里正当地提到这些名字是允许的），但字符串字面量保留 ——
 * 否则 `const u = 'http://x'` 里的 `//` 会把后半段变成盲区。
 */

/** 去掉注释，保留字符串字面量 */
export function stripComments(source: string): string {
  let out = '';
  let index = 0;
  while (index < source.length) {
    const char = source[index]!;
    const next = source[index + 1];
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1;
      index += 2;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      out += char;
      index += 1;
      while (index < source.length && source[index] !== char) {
        if (source[index] === '\\') {
          out += source[index];
          index += 1;
        }
        out += source[index];
        index += 1;
      }
      out += char;
      index += 1;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

/** 源码里出现的所有模块来源（静态 / 副作用 / 动态，单双引号都算） */
export function importedModules(source: string): string[] {
  const found = new Set<string>();
  for (const pattern of [
    /from\s+['"]([^'"]+)['"]/g, // import x from 'y' / export { x } from 'y'
    /(?:^|[\s;{(=])import\s*\(?\s*['"]([^'"]+)['"]/g // import 'y' / import('y')
  ]) {
    for (const match of source.matchAll(pattern)) found.add(match[1]!);
  }
  return [...found];
}

export interface GuardRule {
  /** 这份文件允许 import 的模块（写出来是为了让下一个人知道边界在哪） */
  readonly allow: readonly string[];
  /** 不许出现的标识符（拿到完整状态 / 直接碰存储的那几个入口） */
  readonly forbidden: readonly string[];
}

/** 返回违规清单（空数组 = 干净）。纯函数：真实文件与违规样例走同一段判断 */
export function violationsOf(source: string, rule: GuardRule): string[] {
  const code = stripComments(source);
  const found: string[] = [];
  for (const name of rule.forbidden) {
    if (new RegExp(`\\b${name}\\b`).test(code)) found.push(name);
  }
  const allowed = new Set(rule.allow);
  for (const module of importedModules(code)) {
    if (!allowed.has(module)) found.push(`import ${module}`);
  }
  return found;
}
