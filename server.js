// Simple static file server for Study Table
const http = require('http');
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = __dirname; // serve from current directory

const server = http.createServer((req, res) => {
  let safePath = decodeURIComponent(req.url.split('?')[0]);
  // default to index.html
  if (safePath === '/' || safePath === '') safePath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, safePath);
  // prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not Found');
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.json': 'application/json'
    }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

// Start server on an available port automatically
let port = 8000;
function startServer() {
  server.listen(port, () => {
    console.log(`\n================================================================`);
    console.log(`🚀 Study Table server running at: http://localhost:${port}`);
    console.log(`================================================================\n`);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`⚠️  Port ${port} is already in use, trying next port ${port + 1}...`);
    port++;
    startServer();
  } else {
    console.error('Server error:', err);
  }
});

startServer();
