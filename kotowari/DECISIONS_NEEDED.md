# DECISIONS_NEEDED — 依頼者の判断が要る事項

自律的に決められない重大事項だけを書く。ほかは決めて GAME_DESIGN.md／HANDOFF.md に理由を残す。

| # | 事項 | 保留の理由 | 推奨案 | 状態 |
|---|---|---|---|---|
| D1 | 旧リポジトリ `-` の `main` への取り込み | 新リポジトリ `-2` へ移したため不要 | ― | 終了 |
| D2 | 公開（itch.io など）・販売 | 外部公開・登録は依頼者の許可が要る | 1 ファイル版を作れるようにしておく | 保留 |
| D3 | `-2` への push | Claude の GitHub アプリが `-2` に入っていないため push が拒否される | 依頼者が https://github.com/apps/claude/installations/select_target で `-2` にアプリを入れる。入るまでは手元でコミットし、旧リポジトリ `-` の作業ブランチ `feature/kotowari-3d` の `kotowari/` にも同じ内容を push して控えにする | 保留 |
