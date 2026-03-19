import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createWriteStream } from 'fs';

const version = '39.2.7';
const platform = os.platform();
const arch = os.arch();

const platformMap = {
  'win32': 'win32',
  'darwin': 'darwin',
  'linux': 'linux'
};

const archMap = {
  'x64': 'x64',
  'arm64': 'arm64',
  'ia32': 'ia32'
};

const plat = platformMap[platform] || platform;
const archName = archMap[arch] || arch;

const filename = `electron-v${version}-${plat}-${archName}.zip`;
const url = `https://npmmirror.com/mirrors/electron/v${version}/${filename}`;

console.log(`Platform: ${plat}, Arch: ${archName}`);
console.log(`Downloading: ${url}`);

const zipPath = path.join(os.tmpdir(), filename);
const file = createWriteStream(zipPath);

https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
  if (response.statusCode === 302 || response.statusCode === 301) {
    https.get(response.headers.location, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res2) => {
      res2.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`Downloaded to: ${zipPath}`);
        console.log('Please extract this zip to: node_modules/electron/dist/');
      });
    }).on('error', (err) => {
      fs.unlinkSync(zipPath);
      console.error('Download error:', err.message);
    });
  } else if (response.statusCode === 200) {
    response.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log(`Downloaded to: ${zipPath}`);
      console.log('Please extract this zip to: node_modules/electron/dist/');
    });
  } else {
    console.error(`Download failed: HTTP ${response.statusCode}`);
    process.exit(1);
  }
}).on('error', (err) => {
  fs.unlinkSync(zipPath);
  console.error('Download error:', err.message);
});
