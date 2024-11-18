const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    ['/api', '/upload', '/system-info', '/check-assistant', '/vector-stores', '/chat', '/files'],
    createProxyMiddleware({
      target: 'http://localhost:8000',
      changeOrigin: true,
      pathRewrite: {
        '^/upload': '/api/upload',
        '^/system-info': '/api/system-info',
        '^/check-assistant': '/api/check-assistant',
        '^/vector-stores': '/api/vector-stores',
        '^/chat': '/api/chat',
        '^/files': '/api/files'
      }
    })
  );
}; 