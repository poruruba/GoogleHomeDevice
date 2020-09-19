'use strict';

var dgram = require('dgram');

const { URL, URLSearchParams } = require('url');
const fetch = require('node-fetch');
const Headers = fetch.Headers;

const base_url = "【Node.jsサーバのURL】";

var UDP_HOST = '0.0.0.0';
var UDP_PORT = 3333; //ESP32からのUDP受信を待ち受けるポート番号

var server = dgram.createSocket('udp4');

server.on('listening', function () {
  var address = server.address();
  console.log('UDP Server listening on ' + address.address + ":" + address.port);
});

server.on('message', async (message, remote) => {
  console.log(remote.address + ':' + remote.port +' - ' + message);
  var body = JSON.parse(message);

  var json = await do_post(base_url + '/reportstate', body);
  console.log(json);
});

server.bind(UDP_PORT, UDP_HOST);

function do_post(url, body) {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });

  return fetch(new URL(url).toString(), {
      method: 'POST',
      body: JSON.stringify(body),
      headers: headers
    })
    .then((response) => {
      if (!response.ok)
        throw 'status is not 200';
      return response.json();
    });
}
