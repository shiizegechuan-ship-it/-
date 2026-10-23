# HANDOFF — ことわり質屋（引き継ぎ）

最終更新：2026-10-23（セッション 1）

## 今の状態
- ブランチ：`feature/kotowari-3d`（`main` から分岐。push 済み。PR は未作成＝DECISIONS_NEEDED D1）
- 最後に成功した検査：`npm run check`（型・lint・テスト 34 件・ビルド）、`node tools/e2e/play.mjs`（18/18）、`node tools/e2e/shots.mjs`
- 遊べる範囲：タイトル → 序章（神楽殿）→ 一の章（千段石段）→「つづく」。質屋で 4 つの型の質入れ・請け出し・つけが動く。
- 現在の不具合：無し（既知の見た目の課題は下の「次にやること」）

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
| 検査の入口（ブラウザ） | `window.__k`（`step(n)`・`sim()`・`state()`・`startAt(章)`・`skipCard()`）。`__k.app.manual = true` で手動コマ送り |

## 次にやること（IMPLEMENTATION_PLAN の順）
1. Phase 1 の残り：妖の戦闘の手触りの確認（ヒットストップ・予兆の見え方）をスクリーンショットで確認、性能の計測（中央値・最悪コマ）。
2. Phase 2：妖の模型の作り込み（面の妖のシルエット）、一の章の景色（杉並木・大石灯籠の見せ方）、BGM・効果音の確認（書き出してピーク検査）。
3. 二の章（竹林・風）へ。

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
