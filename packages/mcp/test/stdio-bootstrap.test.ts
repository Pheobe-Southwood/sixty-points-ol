/**
 * stdio 入口的**启动契约**：参数不全或服务器不可达时，必须当场以非 0 退出并说清原因，
 * 而不是静静地等着第一次工具调用才失败（那对宿主来说只是一个莫名其妙的工具错误）。
 *
 * 这一条要 spawn 真子进程 —— 受限沙箱下 piped stdio 必 EPERM（AGENTS 规则 5），
 * 所以被拒绝时**显式跳过并说明**，而不是假装通过：CI 与本机（非受限）会真跑。
 *
 * 完整的 stdio 一副牌端到端在 scripts/mcp-check.ts（需要服务端在跑）。
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ENTRY = fileURLToPath(new URL('../src/stdio.ts', import.meta.url));
/** 一个必然连不上的地址：连接被拒是即时的，不吃超时 */
const DEAD_BASE = 'http://127.0.0.1:1';

interface RunResult {
  readonly code: number | null;
  readonly stderr: string;
}

function runStdio(env: Record<string, string>): Promise<RunResult> {
  return new Promise<RunResult>((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

function isSpawnDenied(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === 'EPERM' || code === 'EACCES';
}

test('stdio 入口：缺凭据或服务器不可达时立刻失败，且说明原因', async (t) => {
  let missing: RunResult;
  try {
    missing = await runStdio({ SIXTY_CREDENTIAL: '', SIXTY_BASE_URL: DEAD_BASE });
  } catch (error) {
    if (isSpawnDenied(error)) {
      t.skip('受限沙箱不允许 spawn 子进程（piped stdio EPERM）；这一条在 CI 与本机真跑');
      return;
    }
    throw error;
  }

  assert.equal(missing.code, 1, '缺凭据必须以非 0 退出');
  assert.match(missing.stderr, /SIXTY_CREDENTIAL/, '缺凭据时没有说明该配哪个环境变量');
  assert.match(missing.stderr, /\[sixty-mcp\]/, '错误信息没有前缀，宿主里看不出是谁在报错');

  // base64url("test:token")：凭据格式合法但服务器不可达
  const unreachable = await runStdio({ SIXTY_CREDENTIAL: 'dGVzdDp0b2tlbg', SIXTY_BASE_URL: DEAD_BASE });
  assert.equal(unreachable.code, 1, '服务器不可达必须以非 0 退出');
  assert.match(unreachable.stderr, /连不上/, '服务器不可达时没有说清是连不上');
});
