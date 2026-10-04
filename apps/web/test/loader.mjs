/**
 * 测试专用解析钩子：让 `node --test` 认识 SvelteKit 的两样东西。
 *
 * 应用源码里写的是 `$lib/xxx` 与 `./db`（省略扩展名）—— 那是 Vite/SvelteKit 的解析规则，
 * 普通 node 都不认，于是 `apps/web` 的服务端模块一直没法在 `node:test` 里被 import，
 * 只能靠脚本起真服务器做 e2e。
 *
 * 机器人功能需要在**进程内**验证调度器（延迟调零、加/踢、重启补扫），所以在这里补上
 * 两条解析规则，而不是把整个 `apps/web` 的 import 改成带 `.ts` 后缀（那是为了测试
 * 改应用写法，方向反了）。构建与运行期不经过这里，SvelteKit 自己的解析不受影响。
 *
 * 用法见 `package.json` 的 test 脚本：`node --import ./test/loader.mjs --test ...`
 */
import { register } from 'node:module';

register('./resolve-hooks.mjs', import.meta.url);
