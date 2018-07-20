// @flow

const http = require('http');
const https = require('https');
const url = require('url');
const invariant = require('invariant');

http.createServer((req, _res) => {
  const path = req.url;
  const queryParams = url.parse(req.url, true).query;
  invariant(queryParams);
  if (path === '/healthcheck') {
    _res.writeHead(204);
    _res.end();
    return;
  }
  if (!queryParams.project) {
    _res.writeHead(400);
    _res.end(`No 'project' query parameter supplied`);
  } else if (!queryParams.token) {
    _res.writeHead(400);
    _res.end(`No 'token' query parameter supplied`);
  }
  getArtifacts(queryParams.project, queryParams.token, queryParams.filename)
    .then(artifactsUrl => {
      _res.writeHead(302, {
        'Location': artifactsUrl
      });
      _res.end();
    })
    .catch(err => {
      _res.writeHead(500);
      _res.end(`Error parsing circleci response: ${err}`);
    });
}).listen(3000);

async function getArtifacts(project, token, filename) {
  const latestBuildNum = await getLatestBuilds(project, token);
  const result = await getUrl({
    hostname: 'circleci.com',
    path: `/api/v1.1/project/github/${project}/${latestBuildNum}/artifacts?circle-token=${token}`
  });
  if (!result.length) throw new Error(`0 length artifacts response received`);
  for (var item of result) {
    if (!filename) break;
    if (item.path.indexOf(filename) === -1) continue;
    return Promise.resolve(item.url);
  }
  return Promise.resolve(result[0].url);
}

async function getLatestBuilds(project, token) {
  const result = await getUrl({
    hostname: 'circleci.com',
    path: `/api/v1.1/project/github/${project}?circle-token=${token}`,
  });
  if (!result.length) return Promise.resolve(0);
  return Promise.resolve(result[0].previous_successful_build.build_num);
}

async function getUrl(options) {
  return new Promise((resolve, reject) => {
    https.get({
      ...options,
      headers: {
        'Accept': 'application/json'
      }
    }, res => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Non-200 status code received: ${res.statusCode}, ${res.statusMessage}`));
      }
      res.setEncoding('utf8');
      const data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        try {
          const received = data.join('');
          if (!received.length) throw new Error('0 length response received');
          const result = JSON.parse(received);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
    });
  });
}