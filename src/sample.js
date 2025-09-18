#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { glob } = require('glob');

// package.jsonから設定を読み込み
const packageJson = require('../package.json');
const config = packageJson.megrep;

class ImageSampler {
  constructor() {
    this.contentsDir = path.join(__dirname, '../contents');
    this.sampleDir = path.join(__dirname, '../contents_sample');
  }

  getImageFiles() {
    const patterns = config.supportedFormats.map(ext => 
      `${this.contentsDir}/**/*.${ext}`
    );
    
    let files = [];
    console.log('📁 画像ファイルをスキャン中...');
    
    patterns.forEach(pattern => {
      const matches = glob.sync(pattern, { nocase: true });
      files = files.concat(matches);
    });
    
    return files;
  }

  getRelativePath(filePath) {
    return path.relative(this.contentsDir, filePath);
  }

  formatFileSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  getFileInfo(filePath) {
    const stats = fs.statSync(filePath);
    return {
      path: filePath,
      relativePath: this.getRelativePath(filePath),
      size: stats.size,
      sizeFormatted: this.formatFileSize(stats.size),
      extension: path.extname(filePath).toLowerCase(),
      directory: path.dirname(this.getRelativePath(filePath)),
      name: path.basename(filePath),
      modified: stats.mtime
    };
  }

  analyzeFiles(files) {
    console.log('📊 ファイル分析中...');
    
    const fileInfos = files.map(f => this.getFileInfo(f));
    const totalSize = fileInfos.reduce((sum, f) => sum + f.size, 0);
    
    // ディレクトリ別統計
    const dirStats = {};
    fileInfos.forEach(f => {
      const dir = f.directory || 'root';
      if (!dirStats[dir]) {
        dirStats[dir] = { count: 0, size: 0 };
      }
      dirStats[dir].count++;
      dirStats[dir].size += f.size;
    });

    // 拡張子別統計
    const extStats = {};
    fileInfos.forEach(f => {
      if (!extStats[f.extension]) {
        extStats[f.extension] = { count: 0, size: 0 };
      }
      extStats[f.extension].count++;
      extStats[f.extension].size += f.size;
    });

    console.log('\n📈 ファイル統計:');
    console.log(`総ファイル数: ${fileInfos.length.toLocaleString()}件`);
    console.log(`総サイズ: ${this.formatFileSize(totalSize)}`);
    
    console.log('\n📁 ディレクトリ別（上位10件）:');
    const topDirs = Object.entries(dirStats)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);
    
    topDirs.forEach(([dir, stats]) => {
      console.log(`  ${dir}: ${stats.count.toLocaleString()}件 (${this.formatFileSize(stats.size)})`);
    });

    console.log('\n🔧 拡張子別:');
    Object.entries(extStats)
      .sort((a, b) => b[1].count - a[1].count)
      .forEach(([ext, stats]) => {
        console.log(`  ${ext || '(なし)'}: ${stats.count.toLocaleString()}件 (${this.formatFileSize(stats.size)})`);
      });

    return { fileInfos, dirStats, extStats, totalSize };
  }

  async randomSample(files, percentage = 10) {
    console.log(`\n🎲 ランダムサンプリング (${percentage}%)`);
    
    const sampleCount = Math.floor(files.length * (percentage / 100));
    const shuffled = [...files].sort(() => 0.5 - Math.random());
    const sampled = shuffled.slice(0, sampleCount);
    
    console.log(`${files.length.toLocaleString()}件から${sampleCount.toLocaleString()}件を選択`);
    
    return sampled;
  }

  async sizeSample(files, minSizeKB = 50, maxSizeKB = 5000) {
    console.log(`\n📏 サイズフィルタリング (${minSizeKB}KB - ${maxSizeKB}KB)`);
    
    const minSize = minSizeKB * 1024;
    const maxSize = maxSizeKB * 1024;
    
    const filtered = files.filter(file => {
      const stats = fs.statSync(file);
      return stats.size >= minSize && stats.size <= maxSize;
    });
    
    console.log(`${files.length.toLocaleString()}件から${filtered.length.toLocaleString()}件を選択`);
    
    return filtered;
  }

  async directorySample(files, maxPerDirectory = 100) {
    console.log(`\n📂 ディレクトリ単位サンプリング (各ディレクトリ最大${maxPerDirectory}件)`);
    
    const dirGroups = {};
    files.forEach(file => {
      const dir = path.dirname(this.getRelativePath(file)) || 'root';
      if (!dirGroups[dir]) dirGroups[dir] = [];
      dirGroups[dir].push(file);
    });

    const sampled = [];
    Object.entries(dirGroups).forEach(([dir, dirFiles]) => {
      const shuffled = [...dirFiles].sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, maxPerDirectory);
      sampled.push(...selected);
      console.log(`  ${dir}: ${dirFiles.length} → ${selected.length}件`);
    });
    
    console.log(`総選択: ${sampled.length.toLocaleString()}件`);
    
    return sampled;
  }

  async copyToSample(files, method = 'copy') {
    console.log(`\n📋 ファイルを${method === 'copy' ? 'コピー' : '移動'}中...`);
    
    await fs.ensureDir(this.sampleDir);
    
    let count = 0;
    for (const file of files) {
      const relativePath = this.getRelativePath(file);
      const targetPath = path.join(this.sampleDir, relativePath);
      
      await fs.ensureDir(path.dirname(targetPath));
      
      if (method === 'copy') {
        await fs.copy(file, targetPath);
      } else {
        await fs.move(file, targetPath);
      }
      
      count++;
      if (count % 100 === 0) {
        console.log(`  処理済み: ${count}/${files.length}`);
      }
    }
    
    console.log(`✅ ${method === 'copy' ? 'コピー' : '移動'}完了: ${count}件`);
  }

  async interactive() {
    const files = this.getImageFiles();
    
    if (files.length === 0) {
      console.log('❌ contentsフォルダに画像ファイルが見つかりませんでした');
      return;
    }

    // ファイル分析
    const analysis = this.analyzeFiles(files);
    
    console.log('\n🔄 間引き方法を選択してください:');
    console.log('1. ランダムサンプリング（10%）');
    console.log('2. ランダムサンプリング（1%）');
    console.log('3. サイズフィルタリング（50KB-2MB）');
    console.log('4. ディレクトリ単位（各ディレクトリから最大50件）');
    console.log('5. ディレクトリ単位（各ディレクトリから最大10件）');
    console.log('6. カスタム設定');
    console.log('0. 分析のみ（何もしない）');
    
    // Node.jsでは標準入力が難しいので、引数から取得
    const method = process.argv[2] || '0';
    
    let selectedFiles = [];
    
    switch (method) {
      case '1':
        selectedFiles = await this.randomSample(files, 10);
        break;
      case '2':
        selectedFiles = await this.randomSample(files, 1);
        break;
      case '3':
        selectedFiles = await this.sizeSample(files, 50, 2048);
        break;
      case '4':
        selectedFiles = await this.directorySample(files, 50);
        break;
      case '5':
        selectedFiles = await this.directorySample(files, 10);
        break;
      case '6':
        console.log('カスタム設定は未実装です。コードを直接編集してください。');
        return;
      default:
        console.log('分析完了。間引きは行いませんでした。');
        return;
    }

    if (selectedFiles.length > 0) {
      console.log(`\n📦 contents_sample/に${selectedFiles.length.toLocaleString()}件をコピーします`);
      await this.copyToSample(selectedFiles, 'copy');
      
      console.log('\n💡 次の手順:');
      console.log('1. contents_sample/の内容を確認');
      console.log('2. 問題なければ: mv contents contents_original && mv contents_sample contents');
      console.log('3. またはcontents/を削除してcontents_sample/をcontents/にリネーム');
    }
  }
}

// 使用方法の表示
function showUsage() {
  console.log('🎯 megrep 画像間引きツール');
  console.log('\n使用方法:');
  console.log('  npm run sample [方法番号]');
  console.log('  node src/sample.js [方法番号]');
  console.log('\n方法番号:');
  console.log('  1: ランダム10%');
  console.log('  2: ランダム1%');
  console.log('  3: サイズ制限(50KB-2MB)');
  console.log('  4: 各ディレクトリ50件まで');
  console.log('  5: 各ディレクトリ10件まで');
  console.log('  0: 分析のみ');
  console.log('\n例: npm run sample 2  # 1%をランダムサンプリング');
}

// メイン実行
if (require.main === module) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showUsage();
  } else {
    const sampler = new ImageSampler();
    sampler.interactive().catch(console.error);
  }
}

module.exports = ImageSampler;
