# megrep

画像などの軽量化ツールを比較するツール

## コンセプト

画像の軽量化を行う際、avifまたはwebpを使うが、以下の疑問がある。

- クオリティをどんな値にすればよいか
- オプションに何を指定すべきか

```bash
# AVIF
avifenc -q 60 work/lenna/lenna.jpg work/lenna/lenna.jpg.q60.avif

# WebP
cwebp -metadata icc -q 80 work/lenna/lenna.jpg -o work/lenna/lenna.jpg.q80.webp
```

それぞれの手法で変換し、目grepで一気に確認できるようにする。

## 確認方法

1. `contents` フォルダに画像を配置する。これはディレクトリ形式でもかまわない。実際に運用しているWordPressサイトの `wp-content/uploads` などをダウンロードして使う
2. 置換コマンドを走らせる。このコマンドにより、`avif` と `webp` にそれぞれの圧縮された画像が保存される。
3. HTMLページを開くと、同じ画像が3ペインで並んでいる。

## インストール

### 1. 必要なツールをインストール

```bash
# macOS (Homebrew)
brew install webp libavif

# Ubuntu/Debian
sudo apt install webp libavif-bin

# Windows (Chocolatey)
choco install webp libavif
```

### 2. プロジェクトの依存関係をインストール

```bash
npm install
```

## 使い方

### 1. 画像を配置

`contents` フォルダに変換したい画像を配置します。ディレクトリ構造も保持されます。

```bash
# 例：WordPressサイトのアップロードディレクトリをコピー
cp -r /path/to/wp-content/uploads/* contents/
```

#### 大量の画像がある場合の間引き

画像数が多すぎる場合は、間引きツールで適量に調整できます：

```bash
# まずは分析のみ実行
npm run sample 0

# 1%をランダムサンプリング（おすすめ）
npm run sample 2

# その他のオプション
npm run sample 1  # 10%をランダムサンプリング  
npm run sample 4  # 各ディレクトリから最大50件
npm run sample 5  # 各ディレクトリから最大10件
```

間引き後は自動的に `contents_sample` フォルダに保存され、元フォルダとの入れ替え手順が表示されます。

### 2. 画像を変換

```bash
npm run convert
```

このコマンドにより以下が実行されます：
- `contents` フォルダ内の画像を再帰的にスキャン
- AVIFとWebPに変換して `avif`、`webp` フォルダに保存
- 変換結果のメタデータを `results.json` に保存

#### 大量ファイル処理の最適化機能
- **バッチ処理**: 50件ずつ処理してメモリ使用量を抑制
- **進捗保存**: 処理が中断されても途中から再開可能
- **重複回避**: 既に変換済みのファイルは自動スキップ
- **リアルタイム進捗**: 処理状況と残り時間の表示
- **中間保存**: 定期的に結果を保存してデータ損失を防止

19万枚のような大量の画像でも安心して処理できます。処理を中断した場合は、再度 `npm run convert` を実行すれば続きから開始します。

### 3. 比較UIを表示

```bash
npm run serve
```

ブラウザで `http://localhost:3000/src/web/` を開くと、3ペインで比較表示されます。

## 設定のカスタマイズ

`package.json` の `megrep` セクションで変換設定を変更できます：

```json
{
  "megrep": {
    "avif": {
      "quality": 60,  // 画質 (0-100)
      "speed": 6      // エンコード速度 (0-10, 高いほど高速)
    },
    "webp": {
      "quality": 80,     // 画質 (0-100)
      "method": 4,       // 圧縮方法 (0-6, 高いほど高圧縮)
      "metadata": "icc"  // メタデータ保持
    },
    "supportedFormats": ["jpg", "jpeg", "png", "tiff", "bmp"]
  }
}
```

## 機能

### 実装済み
- [x] 画像を再帰的にwebpとavifに変換するコマンド
- [x] 画像を3ペインで表示するHTMLとJS
- [x] ファイルサイズと圧縮率の表示
- [x] 画像検索・ソート機能
- [x] 遅延読み込みによるパフォーマンス最適化
- [x] 画像拡大表示機能

### 将来予定
- [ ] 画像を重ねてスライダーでどちらかを表示するような手法（Kaleid Scopeなどの機能）
- [ ] 複数品質設定での一括変換
- [ ] バッチ処理の進捗表示
- [ ] 変換前後の画質比較指標（SSIM等）
