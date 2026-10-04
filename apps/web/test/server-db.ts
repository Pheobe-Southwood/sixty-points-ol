/**
 * 进程内服务端测试的共用准备：**必须在 import 任何 `$lib/server` 模块之前**生效。
 *
 * - `SIXTY_DB` 指向测试专用文件（别碰开发库），并在启动时清一次；
 * - 机器人延迟调零：调度器在测试里要立刻出手，而不是等 0.5–1.5 秒。
 *
 * 为什么单独一个文件：`--test-isolation=none` 下所有测试文件共用同一个进程与模块缓存，
 * 两个测试文件各自 `rmSync` + 设 env 会互相踩（后一个会把前一个已经打开的库删掉，
 * 或者设了 env 却因为模块已缓存而不生效）。ESM 模块只求值一次，所以这里天然「只跑一次」。
 */
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const TEST_DB_PATH = fileURLToPath(new URL('../data/test-server.db', import.meta.url));

process.env['SIXTY_DB'] = TEST_DB_PATH;
process.env['SIXTY_BOT_DELAY_MIN_MS'] = '0';
process.env['SIXTY_BOT_DELAY_MAX_MS'] = '0';
for (const suffix of ['', '-wal', '-shm']) rmSync(`${TEST_DB_PATH}${suffix}`, { force: true });
