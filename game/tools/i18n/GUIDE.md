# Translation guide — 夜明けの楔 / Wedge of Dawn

A 2D action roguelite. The apprentice of the clock tower's master (the **Timekeeper**) relives the same night again and again.
Each time the master rings the forbidden **Rewinding Bell**, time returns to the start of the night and the master loses one night of life.
Only the apprentice remembers, thanks to the **Wedge of Time** the master taught them. Goal: reach the dawn.
The master's daughter **Lira** is leaving on the morning train; the master fears seeing her off (that is why he stops the night).

## Files
- Input: `tools/i18n/work/chunk-1.json` … `chunk-4.json`. Each item: `id`, `key` (Japanese source), `where` (file:line in `src/`), sometimes `code` (the source line, for short strings).
- Output: `tools/i18n/out/<lang>-<n>.json` for chunk n — a JSON object `{ "<id>": "<translation>", ... }` covering **every id** in that chunk.
- You may read `src/` to understand context (e.g. how a fragment is joined).

## Hard rules
1. Keep every placeholder `{0}`, `{1}` … exactly (same set). You may reorder them.
2. Keep the same number of `\n` line breaks (they are layout). Do not add new ones.
3. Keep symbols as they are: ◆ ★ ☆ ▶ ▸ ← → ↑ ↓ × ・ ― and key names (Z, X, C, V, Tab, Enter, Esc, Shift).
4. Be **concise**. The UI was laid out for Japanese, which is very compact. Prefer short words; abbreviations are fine for stats (ATK, HP, DMG, CD, Lv). Long text scrolls, but short labels should stay short.
5. Fragments: some keys are pieces joined in code (e.g. `あり`/`なし` → On/Off, `、` → `, `, `（`/`）` → ` (`/`)`, `：` → `: `). Look at `code`/`where` and translate so the joined result reads naturally. A key that is only Japanese punctuation should become the natural punctuation of your language (for Chinese keep full-width ， 。 ： （ ）).
6. Numbers and units: keep numbers; translate units (秒 → s / sec, 体 → (count), 回 → times …).
7. Use the glossary below consistently (translate the English column into your language once and reuse it).
8. Output valid JSON only (escape `"` and `\` correctly, keep `\n` as the two-character escape inside JSON strings).

## Tone
- Narration: quiet, literary, short sentences.
- The master (Timekeeper): grave, old-fashioned. Glen (blacksmith): rough, friendly ("kid"). Lira: gentle girl. Companions are small creatures.
- UI: plain and clear.

## Glossary (English reference)
| 日本語 | English |
|---|---|
| 夜明けの楔 | Wedge of Dawn (game title & true ending) |
| 時の楔 / 楔 / 楔を打つ | Wedge of Time / wedge / drive a wedge |
| 刻守 | the Timekeeper (boss; the master) |
| 白き刻守 | the White Timekeeper |
| 師 / 弟子 | Master / apprentice |
| リラ / グレン | Lira / Glen |
| ホタル / ネジ / チク | Hotaru / Neji / Chiku (companions: firefly / screw / clock-tick creature) |
| 時戻しの鐘 / 鐘 | the Rewinding Bell / the bell |
| 時の欠片 | Time Shards (meta currency) |
| 刻印 | Crests (permanent upgrades bought with shards) |
| 秒針ゲージ / ゲージ | Second-Hand Gauge / gauge |
| 時歪・刻閃 | Time Warp: Flash Cut (default art) |
| 刹那 / ジャスト回避 | Perfect! (popup) / Perfect Dodge |
| 強化 | Boon(s) |
| 術 / 常時の術 | Art(s) / passive art |
| 共鳴 / 合成 / 相乗 | Resonance / Fusion / Synergy |
| 系統 | school |
| 加速・停滞・残響・危険・火力・術・稀少・伝説・絆・守護・弱体 | Haste, Stasis, Echo, Risk, Power, Arts, Rare, Legendary, Bond, Ward, Hex |
| 中ボス / 精鋭 | Elite |
| 夜（第 3 夜） | Night (Night 3) |
| 巻き戻り | Rewind |
| 下層・市場 / 中層・歯車回廊 / 上層・鐘楼 | Lower: Market / Middle: Gear Corridor / Upper: Belfry |
| 書斎 / 書庫 / 昇降機 | Study / Archive / Lift |
| 黄金の部屋 / 黄金の宝箱 | Golden Vault / golden chest |
| 鍛冶屋 / 祠 / 店 | Smithy / Shrine / Shop |
| 記録帳 | Journal |
| 結末 | Ending |
| 師の眠り / 鐘の沈黙 / 明けない夜 | The Master's Rest / The Bell's Silence / The Dawnless Night (endings) |
| 終わらない夜 / 記憶の固執 | Endless Night / Persistence of Memory |
| 難易度：めちゃ簡単・簡単・普通・難しい・激ムズ | Difficulty: Very Easy, Easy, Normal, Hard, Nightmare |
| 金貨 / レベル / 経験 | Gold / Level / EXP |
| 会心 | critical (crit) |
| 時歪 | time warp (slowed enemies) |
| 回避 / 攻撃 / 跳ぶ / 調べる | Dodge / Attack / Jump / Examine |
| 決定 / 戻る / 閉じる | Confirm / Back / Close |

## Languages
- `en` English · `zh-Hans` Simplified Chinese (mainland) · `zh-Hant` Traditional Chinese (Taiwan usage) · `ko` Korean · `ru` Russian · `es` Spanish (neutral/LatAm-friendly) · `pt-BR` Brazilian Portuguese · `de` German · `fr` French.
