# ことわり質屋（KOTOWARI ― The Pawnshop of Laws）

神楽の舞手・鈴が、自分の「舞（能力）」を狐の質屋に質入れすると、その力は世界の「理（ルール）」になる。
失う動きと得る法則を選び、少し高くつく請け出し（買い戻し）をやりくりしながら、明けない夜の山を登る、和風 3D ドット・アクション探索。

## 動かす
必要なもの：Node.js 22 以上。ブラウザは WebGL2 が使えるもの（確認済みは Chromium のみ）。
```
npm ci
npm run dev        # 開発サーバー http://localhost:5173
npm run check      # 型検査・lint・単体テスト・ビルド
npm run build && npm run e2e   # ブラウザでの流れの検査とスクリーンショット（Playwright の Chromium。out/ に出力）
```

## 操作（キーボード・マウス）
| 操作 | キー |
|---|---|
| 歩く | WASD・矢印 |
| 見回す | マウス（画面をクリックで固定）・右ドラッグ・Q / R |
| 跳 | Space（長押しで高く） |
| 払 | J・左クリック |
| 駆（無敵の駆け抜け） | K・Shift |
| 灯 | L・F |
| 調べる・話す・会話を送る | E・Enter |
| ポーズ | Esc・P |
| 当たり判定の表示 | F2 |

ゲームパッド（標準配列）にも対応（実機は未確認）。

## 中身
- `src/core/`：描画に依存しないゲームの中身（物理・鈴・妖・質入れの経済・章のデータ・台本・セーブ）。Node のテストで全部動く。
- `src/render/`：Three.js。低解像度に描いて整数倍で拡大し、輪郭と和の 34 色パレットへの量子化、特殊効果を 1 回の後処理で行う。模型はすべてコードで組むボクセル。
- `src/audio/`：WebAudio の合成（箏・尺八・太鼓・鈴）と譜面。
- `src/ui/`：DOM の HUD・会話・質屋・メニュー。
- `tests/`：Vitest。`tools/e2e/`：Playwright での検査。

## 資料
`START_HERE.md`（リポジトリのルート）→ `HANDOFF.md` → `IMPLEMENTATION_PLAN.md`。設計は `GAME_DESIGN.md`・`TECH_DESIGN.md`・`STORY_BIBLE.md`。

## 権利
画・音・文章はこの作品のためにコードで生成（Claude Code による制作）。文字は DotGothic16（SIL OFL 1.1、`public/fonts/OFL-DotGothic16.txt`）。詳しくは `ASSET_MANIFEST.md`。
