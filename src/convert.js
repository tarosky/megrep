#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { glob } = require('glob');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

// package.jsonから設定を読み込み
const packageJson = require('../package.json');
const config = packageJson.megrep;

// 並列処理の設定
const BATCH_SIZE = 50; // 一度に処理する画像数
const MAX_WORKERS = Math.min(4, require('os').cpus().length); // ワーカー数

class ImageConverter {
  constructor() {
    this.results = [];
    this.contentsDir = path.join(__dirname, '../contents');
    this.avifDir = path.join(__dirname, '../avif');
    this.webpDir = path.join(__dirname, '../webp');
    this.progressFile = path.join(__dirname, '../progress.json');
    this.processedCount = 0;
    this.totalCount = 0;
    this.startTime = Date.now();
  }

  async init() {
    // 出力ディレクトリを作成
    await fs.ensureDir(this.avifDir);
    await fs.ensureDir(this.webpDir);
  }

  async loadProgress() {
    try {
      if (fs.existsSync(this.progressFile)) {
        const progress = await fs.readJson(this.progressFile);
        this.results = progress.results || [];
        this.processedCount = progress.processedCount || 0;
        console.log(`前回の進捗を読み込みました: ${this.processedCount}件処理済み`);
        // 配列をSetに変換
        return new Set(progress.processedFiles || []);
      }
    } catch (error) {
      console.warn('進捗ファイルの読み込みに失敗しました:', error.message);
    }
    return new Set();
  }

  async saveProgress(processedFiles) {
    try {
      await fs.writeJson(this.progressFile, {
        timestamp: new Date().toISOString(),
        processedCount: this.processedCount,
        totalCount: this.totalCount,
        results: this.results,
        processedFiles: Array.from(processedFiles)
      }, { spaces: 2 });
    } catch (error) {
      console.error('進捗保存エラー:', error.message);
    }
  }

  getImageFiles() {
    const patterns = config.supportedFormats.map(ext => 
      `${this.contentsDir}/**/*.${ext}`
    );
    
    let files = [];
    console.log('画像ファイルをスキャン中...');
    
    patterns.forEach(pattern => {
      const matches = glob.sync(pattern, { nocase: true });
      files = files.concat(matches);
    });
    
    return files;
  }

  isAlreadyConverted(inputPath) {
    const outputPaths = this.getOutputPaths(inputPath);
    return fs.existsSync(outputPaths.avif) && fs.existsSync(outputPaths.webp);
  }

  getRelativePath(filePath) {
    return path.relative(this.contentsDir, filePath);
  }

  getOutputPaths(inputPath) {
    const relativePath = this.getRelativePath(inputPath);
    const parsedPath = path.parse(relativePath);
    const baseName = path.join(parsedPath.dir, parsedPath.name);
    
    return {
      avif: path.join(this.avifDir, `${baseName}.avif`),
      webp: path.join(this.webpDir, `${baseName}.webp`)
    };
  }

  async convertToAvif(inputPath, outputPath) {
    const avifConfig = config.avif;
    const cmd = `avifenc -q ${avifConfig.quality} -s ${avifConfig.speed} "${inputPath}" "${outputPath}"`;
    
    try {
      await fs.ensureDir(path.dirname(outputPath));
      execSync(cmd, { stdio: 'inherit' });
      return true;
    } catch (error) {
      console.error(`AVIF変換エラー: ${inputPath}`, error.message);
      return false;
    }
  }

  async convertToWebp(inputPath, outputPath) {
    const webpConfig = config.webp;
    const cmd = `cwebp -metadata ${webpConfig.metadata} -q ${webpConfig.quality} -m ${webpConfig.method} "${inputPath}" -o "${outputPath}"`;
    
    try {
      await fs.ensureDir(path.dirname(outputPath));
      execSync(cmd, { stdio: 'inherit' });
      return true;
    } catch (error) {
      console.error(`WebP変換エラー: ${inputPath}`, error.message);
      return false;
    }
  }

  getFileSize(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return stats.size;
    } catch (error) {
      return 0;
    }
  }

  calculateCompressionRatio(originalSize, compressedSize) {
    if (originalSize === 0) return 0;
    return Math.round((1 - compressedSize / originalSize) * 100);
  }

  formatFileSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  async processImage(inputPath) {
    const relativePath = this.getRelativePath(inputPath);
    const outputPaths = this.getOutputPaths(inputPath);
    
    console.log(`変換中: ${relativePath}`);
    
    const originalSize = this.getFileSize(inputPath);
    
    // AVIF変換
    const avifSuccess = await this.convertToAvif(inputPath, outputPaths.avif);
    const avifSize = avifSuccess ? this.getFileSize(outputPaths.avif) : 0;
    
    // WebP変換
    const webpSuccess = await this.convertToWebp(inputPath, outputPaths.webp);
    const webpSize = webpSuccess ? this.getFileSize(outputPaths.webp) : 0;
    
    const result = {
      original: {
        path: relativePath,
        size: originalSize,
        sizeFormatted: this.formatFileSize(originalSize)
      },
      avif: {
        path: path.relative(path.join(__dirname, '..'), outputPaths.avif),
        size: avifSize,
        sizeFormatted: this.formatFileSize(avifSize),
        compressionRatio: this.calculateCompressionRatio(originalSize, avifSize),
        success: avifSuccess
      },
      webp: {
        path: path.relative(path.join(__dirname, '..'), outputPaths.webp),
        size: webpSize,
        sizeFormatted: this.formatFileSize(webpSize),
        compressionRatio: this.calculateCompressionRatio(originalSize, webpSize),
        success: webpSuccess
      }
    };
    
    this.results.push(result);
    return result;
  }

  async saveResults() {
    const resultsPath = path.join(__dirname, '../results.json');
    await fs.writeJson(resultsPath, {
      timestamp: new Date().toISOString(),
      config: config,
      results: this.results
    }, { spaces: 2 });
    console.log(`結果を保存しました: results.json`);
  }

  showProgress() {
    const elapsed = Date.now() - this.startTime;
    const percentage = Math.round((this.processedCount / this.totalCount) * 100);
    const remaining = this.totalCount - this.processedCount;
    
    let eta = '';
    if (this.processedCount > 0) {
      const avgTimePerFile = elapsed / this.processedCount;
      const etaMs = avgTimePerFile * remaining;
      const etaMinutes = Math.round(etaMs / 60000);
      eta = ` (残り約${etaMinutes}分)`;
    }
    
    console.log(`進捗: ${this.processedCount}/${this.totalCount} (${percentage}%)${eta}`);
  }

  async processBatch(files, processedFiles) {
    const batch = [];
    
    for (const file of files) {
      if (processedFiles.has(file)) {
        continue; // スキップ
      }
      
      // 既に変換済みかチェック
      if (this.isAlreadyConverted(file)) {
        console.log(`スキップ: ${this.getRelativePath(file)} (既に変換済み)`);
        processedFiles.add(file);
        this.processedCount++;
        continue;
      }
      
      batch.push(file);
      
      if (batch.length >= BATCH_SIZE) {
        break;
      }
    }
    
    if (batch.length === 0) {
      return 0;
    }
    
    console.log(`\n--- バッチ処理開始: ${batch.length}件 ---`);
    
    let batchResults = 0;
    for (const imagePath of batch) {
      try {
        await this.processImage(imagePath);
        processedFiles.add(imagePath);
        this.processedCount++;
        batchResults++;
        
        if (this.processedCount % 10 === 0) {
          this.showProgress();
        }
      } catch (error) {
        console.error(`処理エラー: ${imagePath}`, error.message);
        processedFiles.add(imagePath); // エラーでもスキップリストに追加
        this.processedCount++;
      }
    }
    
    // バッチ完了後に進捗を保存
    await this.saveProgress(processedFiles);
    
    return batchResults;
  }

  async generateResultsFromExisting() {
    console.log('📋 既存ファイルからresults.jsonを再生成中...');
    
    await this.init();
    const imageFiles = this.getImageFiles();
    
    for (const inputPath of imageFiles) {
      const outputPaths = this.getOutputPaths(inputPath);
      
      // AVIF/WebPファイルが両方存在する場合のみ追加
      if (fs.existsSync(outputPaths.avif) && fs.existsSync(outputPaths.webp)) {
        const relativePath = this.getRelativePath(inputPath);
        const originalSize = this.getFileSize(inputPath);
        const avifSize = this.getFileSize(outputPaths.avif);
        const webpSize = this.getFileSize(outputPaths.webp);
        
        const result = {
          original: {
            path: relativePath,
            size: originalSize,
            sizeFormatted: this.formatFileSize(originalSize)
          },
          avif: {
            path: path.relative(path.join(__dirname, '..'), outputPaths.avif),
            size: avifSize,
            sizeFormatted: this.formatFileSize(avifSize),
            compressionRatio: this.calculateCompressionRatio(originalSize, avifSize),
            success: true
          },
          webp: {
            path: path.relative(path.join(__dirname, '..'), outputPaths.webp),
            size: webpSize,
            sizeFormatted: this.formatFileSize(webpSize),
            compressionRatio: this.calculateCompressionRatio(originalSize, webpSize),
            success: true
          }
        };
        
        this.results.push(result);
      }
    }
    
    await this.saveResults();
    console.log(`✅ ${this.results.length}件のresults.jsonを再生成しました`);
  }

  async convert() {
    console.log('📦 megrep - 大量画像変換システム');
    console.log(`設定: AVIF q${config.avif.quality}, WebP q${config.webp.quality}`);
    console.log(`バッチサイズ: ${BATCH_SIZE}件ずつ処理`);
    
    await this.init();
    
    // 進捗を読み込み
    const processedFiles = await this.loadProgress();
    
    console.log('📁 画像ファイルをスキャン中...');
    const imageFiles = this.getImageFiles();
    this.totalCount = imageFiles.length;
    
    console.log(`📊 ${imageFiles.length}個の画像ファイルが見つかりました`);
    
    if (imageFiles.length === 0) {
      console.log('❌ contentsフォルダに画像ファイルが見つかりませんでした');
      return;
    }
    
    const remainingFiles = imageFiles.filter(f => !processedFiles.has(f));
    console.log(`⏳ 未処理ファイル: ${remainingFiles.length}件`);
    
    if (remainingFiles.length === 0) {
      console.log('✅ すべてのファイルが処理済みです');
      // results.jsonが空の場合は既存ファイルから再生成
      if (this.results.length === 0) {
        await this.generateResultsFromExisting();
      } else {
        await this.saveResults();
      }
      return;
    }
    
    console.log('\n🚀 変換処理を開始します...');
    this.showProgress();
    
    let currentIndex = 0;
    while (currentIndex < imageFiles.length) {
      const batchFiles = imageFiles.slice(currentIndex, currentIndex + BATCH_SIZE);
      const processed = await this.processBatch(batchFiles, processedFiles);
      
      if (processed === 0) {
        // このバッチでは何も処理されなかった（全てスキップまたは処理済み）
        currentIndex += BATCH_SIZE;
        continue;
      }
      
      // 定期的に結果を保存
      if (this.results.length % (BATCH_SIZE * 2) === 0) {
        await this.saveResults();
        console.log('💾 中間結果を保存しました');
      }
      
      currentIndex += BATCH_SIZE;
    }
    
    await this.saveResults();
    
    const successful = this.results.filter(r => r.avif.success && r.webp.success).length;
    const failed = this.results.filter(r => !r.avif.success || !r.webp.success).length;
    
    console.log('\n🎉 変換完了!');
    console.log(`✅ 成功: ${successful}件`);
    console.log(`❌ 失敗: ${failed}件`);
    console.log(`⏱️  総処理時間: ${Math.round((Date.now() - this.startTime) / 1000)}秒`);
    
    // 進捗ファイルをクリーンアップ
    if (fs.existsSync(this.progressFile)) {
      await fs.remove(this.progressFile);
      console.log('🧹 進捗ファイルをクリーンアップしました');
    }
  }
}

// メイン実行
if (require.main === module) {
  const converter = new ImageConverter();
  converter.convert().catch(console.error);
}

module.exports = ImageConverter;
