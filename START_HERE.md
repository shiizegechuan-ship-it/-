# はじめに読むファイル

このリポジトリには 2 つの作品がある。**今の制作対象は `kotowari/`（ことわり質屋・3D）**。

| 場所 | 作品 | 状態 |
|---|---|---|
| `kotowari/` | **ことわり質屋**（和風・3D ドット・能力の質入れで世界の理を書き換えるアクション探索） | **制作中**。手順書 `docs/GAME_DEVELOPMENT_MANUAL.md` に従って自律進行 |
| `game/` | 夜明けの楔（2D アクション・ローグライト） | 完成済み・販売準備中。案内は `game/START_HERE_RELEASE.md`。**触らない** |
| `wa-no-shodana.html` | 和の書棚（書院造の 3D デモ） | 別企画の単体デモ。触らない |

## Claude Code へ：ことわり質屋の再開手順（依頼者が「、」だけ送ったとき）
1. `docs/GAME_DEVELOPMENT_MANUAL.md`（ルール。とくに 0 章と 7 章）
2. `kotowari/HANDOFF.md`（今の状態・次のコマンド）
3. `kotowari/IMPLEMENTATION_PLAN.md`（未完了の項目から依存関係上いちばん先のものを選ぶ）
4. 必要に応じて `kotowari/GAME_DESIGN.md`・`TECH_DESIGN.md`・`STORY_BIBLE.md`
5. `git status` → 作業 → `npm run check`（型・lint・テスト・ビルド）→ 記録 → コミット → push

## 動かし方（kotowari）
```
cd kotowari
npm ci
npm run dev        # http://localhost:5173
npm run check      # 型検査・lint・テスト・ビルド
npm run e2e        # ブラウザでの起動・スクリーンショット検査（Playwright の Chromium）
```
