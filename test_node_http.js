const https = require('https');

const data = JSON.stringify({ html: "<h1>test</h1>", ttl: "1h" });

const options = {
  hostname: 'pagedrop.io',
  path: '/api/upload',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'curl/7.81.0',
    'Content-Length': data.length
  }
};

const req = https.request(options, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log('Response:', res.statusCode, body));
});

req.on('error', error => console.error(error));
req.write(data);
req.end();
