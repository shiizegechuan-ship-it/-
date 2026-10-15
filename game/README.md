# 夜明けの楔（Wedge of Dawn）

2D 横スクロールのローグライトアクション × タイムループ。ブラウザで動きます（HTML / Canvas / 素の JavaScript、ビルド不要）。
設計は [`../docs/DESIGN.md`](../docs/DESIGN.md) を参照してください。

## 起動方法
ES モジュールを使うため、`index.html` をファイルとして直接開くのではなく、ローカルサーバー経由で開いてください。

```sh
cd game
npx serve -l 8080 .        # または: python3 -m http.server 8080
# ブラウザで http://localhost:8080 を開く
```

## 操作
| 操作 | キーボード | パッド（標準配置） |
|---|---|---|
| 移動 | ← → / A D | 十字キー・左スティック |
| ジャンプ（長押しで高く） | Z / Space | A |
| 攻撃（連打で3段、長押しで重撃） | X / J | X |
| 回避（無敵あり。直前で避けると「刹那」） | C / Shift / K | B |
| 時歪（秒針ゲージを消費して周囲を遅くする） | V / L | Y |
| 調べる・話す・扉に入る | ↑ / E | 十字上・RB |
| すり抜け床から降りる | ↓ + ジャンプ | |
| 記録帳 | Tab | Back |
| 中断 | Esc / P | Start |

## テスト
```sh
cd game
npm test            # node --test：物理・戦闘・ループ状態・部屋の到達可能性・1周の通し
```

## ファイル構成
```
game/
  index.html          起動ページ
  src/
    config.js         調整用の定数（フレームデータ・速度・無敵時間）
    input.js          入力（キーボード・パッド・テスト用の再生を同じ口で扱う）
    tilemap.js        ASCII で書いた部屋と衝突判定
    player.js         プレイヤーの状態機械（移動・ジャンプ・回避・連撃・重撃・楔を打つ動作）
    enemies.js        錆兵・振り子蝙蝠・時計砲台・歯車騎士・弾
    boss.js           刻守（3段階・時止め・刻守の記憶による対策技）
    boons.js          強化と共鳴・相乗効果
    world.js          部屋のレイアウトと周回ごとの塔の構成（揺らぎ）
    meta.js           周回をまたぐ状態（楔・知識・枠）と周回の終わりの計算（因果）
    game.js           ゲーム本体（DOM に依存しない。テストからも動く）
    render.js / ui.js 描画と HUD・メニュー・巻き戻り画面
    audio.js          WebAudio による合成効果音
    main.js           ブラウザでの起動処理（固定 60Hz 更新）
  tests/              node:test によるテスト
```

## 素材について
絵と音はすべて**仮素材**です。絵は図形とシルエットで描き、音は WebAudio で合成しています。外部ファイルはありません。フォントは Google Fonts（Noto Sans JP / Noto Serif JP）を読み込み、オフラインの場合は OS の日本語フォントで表示されます。

## セーブ
`localStorage` に自動で保存されます。タイトル画面の「はじめから」で消去できます。
