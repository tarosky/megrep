#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

class SimpleHTTPServer {
    constructor(port = 3000, rootDir = path.join(__dirname, '..')) {
        this.port = port;
        this.rootDir = rootDir;
        this.mimeTypes = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.avif': 'image/avif',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon'
        };
    }

    getMimeType(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        return this.mimeTypes[ext] || 'application/octet-stream';
    }

    async handleRequest(req, res) {
        try {
            const url = new URL(req.url, `http://localhost:${this.port}`);
            let filePath = path.join(this.rootDir, decodeURIComponent(url.pathname));

            // セキュリティチェック: ルートディレクトリ外へのアクセスを防ぐ
            const normalizedPath = path.normalize(filePath);
            const normalizedRoot = path.normalize(this.rootDir);
            if (!normalizedPath.startsWith(normalizedRoot)) {
                this.sendError(res, 403, 'Forbidden');
                return;
            }

            // インデックスページの処理
            if (url.pathname === '/' || url.pathname === '/web/') {
                filePath = path.join(this.rootDir, 'src/web/index.html');
            }

            // ファイル存在チェック
            if (!fs.existsSync(filePath)) {
                this.sendError(res, 404, 'Not Found');
                return;
            }

            const stats = fs.statSync(filePath);
            
            // ディレクトリの場合はindex.htmlを探す
            if (stats.isDirectory()) {
                const indexPath = path.join(filePath, 'index.html');
                if (fs.existsSync(indexPath)) {
                    filePath = indexPath;
                } else {
                    this.sendError(res, 404, 'Directory listing not allowed');
                    return;
                }
            }

            // ファイルを読み込んで返す
            const content = fs.readFileSync(filePath);
            const mimeType = this.getMimeType(filePath);

            res.writeHead(200, {
                'Content-Type': mimeType,
                'Content-Length': content.length,
                'Cache-Control': 'no-cache'
            });
            res.end(content);

        } catch (error) {
            console.error('Request handling error:', error);
            this.sendError(res, 500, 'Internal Server Error');
        }
    }

    sendError(res, statusCode, message) {
        const errorHTML = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Error ${statusCode}</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
                    h1 { color: #e74c3c; }
                </style>
            </head>
            <body>
                <h1>Error ${statusCode}</h1>
                <p>${message}</p>
                <p><a href="/">トップページに戻る</a></p>
            </body>
            </html>
        `;

        res.writeHead(statusCode, {
            'Content-Type': 'text/html',
            'Content-Length': Buffer.byteLength(errorHTML)
        });
        res.end(errorHTML);
    }

    start() {
        const server = http.createServer((req, res) => {
            // CORSヘッダーを追加
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }

            console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
            this.handleRequest(req, res);
        });

        server.listen(this.port, () => {
            console.log(`\n🚀 megrep server started!`);
            console.log(`📁 Serving directory: ${this.rootDir}`);
            console.log(`🌐 Local:  http://localhost:${this.port}/`);
            console.log(`🌐 Web UI: http://localhost:${this.port}/src/web/`);
            console.log(`\n💡 Tip: 画像を変換するには 'npm run convert' を実行してください`);
            console.log(`🛑 To stop the server, press Ctrl+C\n`);
        });

        // Graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n🛑 Server shutting down...');
            server.close(() => {
                console.log('✅ Server closed');
                process.exit(0);
            });
        });
    }
}

// メイン実行
if (require.main === module) {
    const port = process.env.PORT || 3000;
    const server = new SimpleHTTPServer(port);
    server.start();
}

module.exports = SimpleHTTPServer;
