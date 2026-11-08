'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createHealthServer, getPort } = require('../src/http-server');

test('porta usa padrão Render e valida configuração', () => {
  assert.equal(getPort(undefined), 10000);
  assert.equal(getPort('8123'), 8123);
  assert.throws(() => getPort('abc'));
  assert.throws(() => getPort('65536'));
});

test('servidor HTTP responde e mostra estado do Discord', async (t) => {
  let connected = false;
  const server = createHealthServer(() => connected);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  function request(path) {
    return new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port: server.address().port, path }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }).on('error', reject);
    });
  }
  let response = await request('/healthz');
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.body).discord, 'desconectado');
  connected = true;
  response = await request('/');
  assert.equal(JSON.parse(response.body).discord, 'conectado');
  assert.equal((await request('/inexistente')).status, 404);
});
