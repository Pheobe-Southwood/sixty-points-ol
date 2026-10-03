/**
 * 续局校验：服务器重启后，用冒烟测试留下的凭据重新拉取视图，
 * 校验牌局状态、级别与历史完全一致（持久化在 SQLite，见 ADR-0002）。
 * 运行：node scripts/resume-check.ts
 */
import { readFileSync } from 'node:fs';

const BASE = process.env['BASE'] ?? 'http://127.0.0.1:5178';
const FILE = process.env['SMOKE_OUT'] ?? 'data/smoke-run.json';

interface Saved {
  code: string;
  identities: { name: string; credential: string }[];
  dealNo: number;
  history: { rank: number; cycle: number }[];
}

interface View {
  dealNo: number;
  levels: { rank: number; cycle: number }[];
  history: unknown[];
  deal: { phase: string } | null;
}

async function main(): Promise<void> {
  const saved = JSON.parse(readFileSync(FILE, 'utf8')) as Saved;
  const views: View[] = [];
  for (const identity of saved.identities) {
    const response = await fetch(`${BASE}/api/tables/${saved.code}/view`, {
      headers: { authorization: `Bearer ${identity.credential}` }
    });
    if (!response.ok) throw new Error(`${identity.name} 取视图失败：${response.status}`);
    const payload = (await response.json()) as { view: View | null };
    if (payload.view === null) throw new Error(`${identity.name} 重启后视图为空（状态未持久化？）`);
    views.push(payload.view);
  }

  const reference = views[0]!;
  if (reference.dealNo !== saved.dealNo) {
    throw new Error(`副数不一致：重启前 ${saved.dealNo}，重启后 ${reference.dealNo}`);
  }
  if (JSON.stringify(reference.levels) !== JSON.stringify(saved.history)) {
    throw new Error(
      `级别不一致：重启前 ${JSON.stringify(saved.history)}，重启后 ${JSON.stringify(reference.levels)}`
    );
  }
  if (reference.history.length !== saved.dealNo) {
    throw new Error(`战报条数 ${reference.history.length} 与副数 ${saved.dealNo} 不一致`);
  }
  console.log(
    `续局正常：同桌 ${saved.code} 第 ${reference.dealNo} 副（${reference.deal?.phase}），级别 ` +
      reference.levels.map((l) => `${l.rank}(+${l.cycle})`).join(' / ')
  );
  console.log('RESUME OK');
}

main().catch((error: unknown) => {
  console.error('RESUME FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
