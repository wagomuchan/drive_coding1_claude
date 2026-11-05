# drive_coding1_claude
ドライブコーディングできるかな

ドライブするたびに、そのドライブ中に設計した機能を1つずつ付け足していくサイトです。

公開URL（GitHub Pages）：https://wagomuchan.github.io/drive_coding1_claude/

## これまでの回

| 回 | 作ったもの | フォルダ |
|---|---|---|
| 第1回 | ドライブの思い出マップ | [drives/01-memory-map/](drives/01-memory-map/)（公開手順：[SETUP.md](drives/01-memory-map/SETUP.md)） |

## フォルダ構成

```
index.html            トップページ（各回へのリンク一覧）
assets/common.css     サイト共通の見た目
drives/
  01-memory-map/      第1回：ドライブの思い出マップ
    index.html        ページ本体
    app.js            地図と投稿フォームの動き
    location.js       現在地の取得（GPS → だめならIPから大まかに）
    storage.js        データの保存・読み込み（ここだけが Apps Script とやりとりする）
    style.css         このページの見た目
    gas/Code.gs       Google Apps Script に貼り付けるサーバー側のコード
    SETUP.md          スプレッドシートと Apps Script の設定、公開の手順
```

## 新しい回を追加するとき

1. `drives/02-なにか/` のようにフォルダを作って、その回のページを入れる
2. トップの `index.html` にある `<li>` を1つコピーして、内容を書き換える
3. この README の「これまでの回」に1行足す
