# ASSET_MANIFEST — 素材の一覧

| 名前 | 用途 | 作成方法 | ライセンス | 改変 | 場所 |
|---|---|---|---|---|---|
| DotGothic16 | 画面の文字 | Fontworks 作（既存作品 `game/assets/fonts` から複製） | SIL OFL 1.1（許諾書を同梱） | なし | `public/fonts/` |
| ボクセル模型（全キャラクター・地形） | 画 | `src/render/models/` のコードで生成（Claude Code が記述） | 本作に帰属 | ― | ソース |
| 音（BGM・効果音） | 音 | `src/audio/` の WebAudio 合成（Claude Code が記述） | 本作に帰属 | ― | ソース |

## 生成 AI の利用
- コード・模型の形・譜面・文章：Claude Code（Anthropic）で作成。既存作品のキャラクター・固有デザインの模倣を指示していない。
- 画像生成・音声生成の AI は使っていない。

## placeholder（仮素材）
なし（作ったら `placeholder` と書いて登録し、Phase 7 で検索して消す）。
