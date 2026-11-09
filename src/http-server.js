'use strict';

const http = require('node:http');

function createHealthServer(isDiscordReady) {
  return http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (!['/', '/healthz'].includes(pathname)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Não encontrado');
      return;
    }
    const body = JSON.stringify({ service: 'InfinityBot', discord: isDiscordReady() ? 'conectado' : 'desconectado' });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  });
}

function getPort(value) {
  const port = Number(value || 10000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT deve ser um número entre 1 e 65535.');
  return port;
}

module.exports = { createHealthServer, getPort };
