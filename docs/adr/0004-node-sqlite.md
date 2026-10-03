# 用 Node 内置 node:sqlite，不用 better-sqlite3

持久化仍是单文件 SQLite + WAL，但驱动换成 Node 内置的 `node:sqlite`（`DatabaseSync`）。原因：better-sqlite3 是原生模块，安装时需要跑构建/预编译脚本（本机沙箱下直接 EPERM，容器里也要预编译产物），而 `node:sqlite` 随 Node ≥ 22.5 自带、同步 API 与用法几乎一致、零安装脚本。数据库访问被收敛在 `apps/web/src/lib/server/db.ts` 一个文件里，若要换回 better-sqlite3 只需改这一处与依赖声明。

代价：`node:sqlite` 仍标注 experimental，API 面比 better-sqlite3 窄（没有 `.pluck()`、备份工具等），且要求运行时 Node 版本足够新。
