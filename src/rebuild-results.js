#!/usr/bin/env node

const ImageConverter = require('./convert.js');

async function rebuildResults() {
  const converter = new ImageConverter();
  console.log('🔄 results.jsonを強制再生成します...');
  
  // resultsを空にして強制的に再生成
  converter.results = [];
  await converter.generateResultsFromExisting();
}

if (require.main === module) {
  rebuildResults().catch(console.error);
}

module.exports = rebuildResults;
