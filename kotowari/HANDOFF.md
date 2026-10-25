# HANDOFF — ことわり質屋（引き継ぎ）

最終更新：2026-10-23（セッション 1・終章まで）

## 今の状態
- ブランチ：`feature/kotowari-3d`（`main` から分岐。push 済み。PR は未作成＝DECISIONS_NEEDED D1）
- 最後に成功した検査：`npm run check`（型・lint・テスト 44 件・ビルド）、`node tools/e2e/play.mjs`（18/18）、ブラウザ自動プレイ（序章→一の章）、Node の通しテスト（序章→終章の碑、種 3）
- 遊べる範囲：タイトル → 序章 → 一〜四の章 → 終章（夜守）→ 最後の選択 → 結末 2 種（明けの舞／常夜）→ クレジット → タイトル。
- 現在の不具合：無し。課題は IMPLEMENTATION_PLAN の「追加の課題」（経済の釣り合い・章の長さ・下手なボット・実 GPU 性能）

## 判断済みの仕様（理由は GAME_DESIGN.md）
- 能力を質に入れると、その能力が世界の「理」になる（跳→浮石／払→風／灯→影／駆→緩）。請け出しは 1.25 倍。
- 本当に詰んだとき（手持ち＋残りの型を全部売っても足りない）だけ「つけ」。
- 鳥居＝チェックポイント・回復・自動保存。倒れても銭は失わない。妖は復活するが銭は 2 度落とさない。
- 画は 3D を低解像度に描いて整数倍で拡大（「細かい」は基準 480×270、「粗い」は 384×216）。
- 旧作 `game/`（夜明けの楔）とは別作品。触らない。

## 仕組みの場所
| 何 | どこ |
|---|---|
| 調整値（操作感・戦闘） | `src/core/data/tuning.ts` |
| 能力と価格・理 | `src/core/data/abilities.ts` |
| 妖 | `src/core/data/enemies.ts`、模型 `src/render/models/creatures.ts` |
| 章の地形 | `src/core/levels/*.ts`（箱・浮石・幽かな橋・影・門・鳥居・道しるべ route） |
| 台本 | `src/core/story.ts` |
| 1 コマの更新 | `src/core/sim.ts` |
| 画面の流れ・イベント→音と演出 | `src/app.ts` |
| 後処理（輪郭・量子化・効果） | `src/render/post.ts`、時間管理 `src/render/fx.ts` |
| 検査の入口（ブラウザ） | `window.__k`（`step(n)`・`sim()`・`state()`・`startAt(章)`・`skipCard()`・`auto(skill, ending)`・`endings()`）。`__k.app.manual = true` で手動コマ送り。`window.__audio`（音の書き出し） |
| 夜守（ボス） | 行動 `Sim.updateBoss`、数値 `tuning.ts` の `BOSS`、描画 `GameView.updateBossView` |
| 結末の演出 | `App.endingDawn`／`endingNight`（段取り `Beat`）、スカイ・ポータル `render/bend.ts`、モーフィング `render/morph.ts`、3DGS `render/splat.ts` |
| 自動プレイ | `src/core/bot/routeBot.ts`（道しるべ・戦い方・仕掛けの時機・風上へ歩く）。各章の `route` |
| 検査スクリプト | `tools/e2e/`：`play.mjs`（キー入力の流れ）・`shots.mjs`・`chapter.mjs 章 x,y,z,yaw…`・`combat.mjs`・`audio.mjs`・`autoplay.mjs`（`START=章 ENDING=dawn/night`） |

## 次にやること（IMPLEMENTATION_PLAN の順）
1. ブラウザでの結末までの自動プレイ（`START=finale ENDING=dawn node tools/e2e/autoplay.mjs`・`ENDING=night`）の結果と、結末の効果のスクリーンショット確認。
2. 追加の課題 A-1〜A-4（経済・章の長さ・下手なボット・性能）。
3. Phase 5・6 の残り（UI のはみ出し検査を画面サイズ別に、長時間の耐久）。
4. Phase 7（仕上げ）。

## 次の具体的なコマンド
```
cd kotowari && npm ci && npm run check && npm run build && node tools/e2e/play.mjs && node tools/e2e/shots.mjs
```

## 保留事項
DECISIONS_NEEDED.md を参照（PR・公開）。

## 未検証
- 音を耳で聞いた確認（環境上できない）。
- ゲームパッド・実機・Chromium 以外のブラウザ。
- 実際の GPU での描画速度（検査は SwiftShader のソフトウェア描画）。
