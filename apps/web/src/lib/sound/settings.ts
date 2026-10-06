/**
 * 声音反馈的本机记忆（localStorage）。
 *
 * 与 `identity.ts` 同一套路：直接读全局 storage，取不到就退回出厂默认 —— 服务端渲染时
 * 没有 storage，拿到的就是默认值，而默认值恰好也是「没设置过」该有的样子。
 *
 * 为什么不放服务端或跟 **身份** 走：这几项是**这台设备上这个浏览器**的偏好（音量、震动），
 * 跟坐在哪个座位无关、也不参与任何规则判定。身份可以跨设备搬，声音偏好搬过去
 * 只会奇怪 —— 手机想震动、桌面想安静，本来就是两回事。
 *
 * 形状上有一条从实测来的教训：**音量的存放形式就是 0~100 的整数，不是开关**。
 * 早先是「音乐开/关 + 音效开/关」两个布尔，第一次真听到声音时的反馈就是「太大」——
 * 布尔开关没有任何可调空间，只能整条关掉。现在两条音频通道各有一个 0~100 的音量，
 * `0` 即静音（等价于旧的「关」），默认 `0`（网页牌桌不自作主张出声）。
 */
export const SOUND_STORAGE_KEYS = {
  /** 背景音乐音量 0~100（仅牌桌页循环播放，0 = 静音） */
  music: 'sixty.sound.music',
  /** 音效音量 0~100（该你了 / 出牌落牌 / 赢墩收墩 / 本副结算，0 = 静音） */
  sfx: 'sixty.sound.sfx',
  /** 震动开关：仅「该你了」时轻震（iOS 不支持，静默降级） */
  vibration: 'sixty.sound.vibration'
} as const;

/** 两条**有音量**的通道。震动没有音量可调，所以不在这个联合里 */
export type SoundVolumeKey = 'music' | 'sfx';

export type SoundSettingKey = keyof typeof SOUND_STORAGE_KEYS;

export interface SoundSettings {
  /** 0~100 */
  readonly music: number;
  /** 0~100 */
  readonly sfx: number;
  readonly vibration: boolean;
}

/** 音量上限与滑块步长（步长 5：够细，又不必为了同一档位来回蹭） */
export const VOLUME_MAX = 100;
export const VOLUME_STEP = 5;

/**
 * 出厂默认：两条音频通道都 `0`（静音）、震动开。
 *
 * 音频要用户主动拉起来（网页牌桌自动出声很容易吵到旁边的人），震动默认开 ——
 * 它不占耳朵，且只在轮到自己那一下，是「静音玩牌」时唯一还能起作用的通道。
 */
export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  music: 0,
  sfx: 0,
  vibration: true
};

/** 把任意输入夹到 0~100 的整数（非数字一律当 0） */
export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(VOLUME_MAX, Math.max(0, Math.round(value)));
}

/**
 * 滑块位置 → 音频增益。
 *
 * **二次曲线**而不是线性：人耳对响度的感受接近对数，线性滑块在中低段几乎听不出差别 ——
 * 0~50 那半程会白占，而「太大」这种反馈恰恰需要低段的分辨率。二次曲线下
 * `30 → 0.09`（约 −21 dB）、`50 → 0.25`（−12 dB）、`100 → 1`。
 *
 * 只调**总电平**：文件之间那套相对配比（该你了最亮、落牌压成底色）是编解码时定好的，
 * 在这里被整体等比缩放，所以拉到多小都不会出现「某一声突然盖过另一声」。
 */
export function volumeGain(percent: number): number {
  const ratio = clampVolume(percent) / VOLUME_MAX;
  return ratio * ratio;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * 读一条通道的音量。缺失、脏值、非数字一律退回默认。
 *
 * 有一条**旧格式的兼容说明**：本功能上线前，这两个键存的是布尔的 `'1'`/`'0'`
 * （开 / 关）。它们在这里都解析得出数字，于是旧值退化成「音量 1（几乎无声）」与
 * 「音量 0（静音）」—— 方向是**变轻**而不是突然变响，所以不另写迁移；真要让旧值
 * 变成满音量，反而会把「嫌吵」的人一次推回最大值。
 */
export function readSoundVolume(key: SoundVolumeKey): number {
  const raw = storage()?.getItem(SOUND_STORAGE_KEYS[key]) ?? null;
  if (raw === null || raw.trim() === '') return DEFAULT_SOUND_SETTINGS[key];
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_SOUND_SETTINGS[key];
  return clampVolume(parsed);
}

/** 读震动开关：只有明确的 `1` 算开，其余（缺失、`0`、脏值、storage 不可用）按默认值 */
export function readVibration(): boolean {
  const raw = storage()?.getItem(SOUND_STORAGE_KEYS.vibration);
  if (raw === '1') return true;
  if (raw === '0') return false;
  return DEFAULT_SOUND_SETTINGS.vibration;
}

export function readSoundSettings(): SoundSettings {
  return {
    music: readSoundVolume('music'),
    sfx: readSoundVolume('sfx'),
    vibration: readVibration()
  };
}

/** 写一条通道的音量；storage 不可用（无痕模式、禁用 cookie）时静默放弃，不抛错 */
export function writeSoundVolume(key: SoundVolumeKey, percent: number): void {
  try {
    storage()?.setItem(SOUND_STORAGE_KEYS[key], String(clampVolume(percent)));
  } catch {
    // 写不进去就算了：设置只在本次会话内生效，不该因此打断打牌
  }
}

export function writeVibration(on: boolean): void {
  try {
    storage()?.setItem(SOUND_STORAGE_KEYS.vibration, on ? '1' : '0');
  } catch {
    // 同上
  }
}
