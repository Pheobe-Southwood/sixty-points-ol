# 音效与背景音乐的来源、许可与定级

`apps/web/static/sounds/` 下 5 个 mp3 全部取自 **CC0(公共领域奉献)** 素材包,**无需署名**。
本文件记录它们的来路,以便日后替换、重编或核对许可。

## 文件清单

| 文件 | 用途 | 来源包 | 源文件 |
| --- | --- | --- | --- |
| `turn.mp3` | 该你了(叫牌 / 埋底 / 出牌三阶段同一声) | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds)(CC0) | `Audio/confirmation_002.ogg` |
| `card.mp3` | 出牌落牌声(任何人出牌) | [Kenney Casino Audio](https://kenney.nl/assets/casino-audio)(CC0) | `Audio/card-place-2.ogg` |
| `trick.mp3` | 赢墩收墩声 | [Kenney Casino Audio](https://kenney.nl/assets/casino-audio)(CC0) | `Audio/card-shove-2.ogg` |
| `settle.mp3` | 本副结算声 | [Kenney Music Jingles](https://kenney.nl/assets/music-jingles)(CC0) | `Audio/Pizzicato jingles/jingles_PIZZI10.ogg` |
| `bgm.mp3` | 背景音乐(仅牌桌页循环) | [OpenGameArt: Snowfall (Looped ver.)](https://opengameart.org/content/snowfall)(CC0) | `Snowfall (Looped ver.)_0.ogg` |

Kenney 的素材包许可页写的是 **CC0 1.0**(可商用、可修改、无需署名);OpenGameArt 上那条的许可字段同样是 **CC0**。
两者都不要求在本仓库保留出处,这里记录纯粹是为了可追溯与可替换。

`docs/` 里原先设想的 freepd.com 已经**关站**(首页现为 "Site Closed"),背景音乐因此改取 OpenGameArt 上那份
明确标注为「Looped ver.」的 49.5 秒循环曲。

## 编码与定级口径

素材是 ogg(vorbis),而 **iOS Safari 不支持 ogg**,所以统一转成 **mp3**(44.1kHz,128kbps;背景音乐 112kbps)。
响度不按积分响度(LUFS)归一:该口径按 ITU-R BS.1770 做门限,对 0.5 秒级的瞬态音效会大面积丢块,
量出来的数没有意义(实测 `card-place-2` 的 LUFS 只有 -26,但它峰值 -1.8 dBFS、听感正常)。
改用**峰值定级 + 有意分层**,数值如下(RMS 为参考值,瞬态音的 RMS 天然很低):

| 文件 | 目标 | 实测 RMS | 实测峰值 |
| --- | --- | --- | --- |
| `turn.mp3` | 峰值 -1.5 dBFS(注意力提示,要听得见) | -15.8 dBFS | -2.0 dBFS |
| `settle.mp3` | RMS -16 dBFS(与「该你了」同档) | -16.4 dBFS | -5.6 dBFS |
| `trick.mp3` | 峰值 -4 dBFS(中等) | -34.9 dBFS | -4.4 dBFS |
| `card.mp3` | 峰值 -6 dBFS(每手都响,压成底色) | -36.2 dBFS | -6.5 dBFS |
| `bgm.mp3` | RMS -24.5 dBFS(垫在提示音之下) | -24.5 dBFS | -8.6 dBFS |

分层理由:落牌声一场要响几十次,不能与「该你了」抢注意力;但它峰值仍高于背景音乐峰值(-6.5 对 -8.6 dBFS),
所以每一手都能从音乐里透出来。

**这张表定的是「文件之间的相对配比」,不是最终听见的音量。** 整体音量由弹层那两条 0~100 的滑块给
(二次曲线:`30 → 0.09`,约 −21 dB;`100 → 1`;`0` 即静音,也是出厂默认),作用在整条通道上,
所以把音量拉小时三声的相对关系不变 —— 不会出现「降完音量后某一手突然盖过音乐」。
换句话说:**调「谁比谁亮」改这里的文件,调「整体多大声」用界面上的滑块**。

**复现/重编的做法**:下载上表的源文件,用 `volume=<增益>dB` 过一遍 libmp3lame 即可,增益 = 目标峰值 − 源峰值
(音乐那一行改用目标 RMS − 源 RMS)。全部文件合计约 721 KB。

已知取舍:mp3 带约 25ms 编码器延迟,背景音乐循环时接缝处有一丝空隙 —— 49.5 秒一轮,听感上可接受;
要完全无缝得换成未压缩或 ogg/opus,而后者会丢掉 iOS。
