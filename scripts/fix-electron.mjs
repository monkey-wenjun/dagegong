import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import os from 'os';

const electronVersion = '39.2.7';
const platform = os.platform();
const arch = os.arch();

// Map platform/arch to Electron's naming
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

const electronPlatform = platformMap[platform] || platform;
const electronArch = archMap[arch] || arch;

const electronDir = path.join(process.cwd(), 'node_modules', 'electron');
const distDir = path.join(electronDir, 'dist');
const pathFile = path.join(electronDir, 'path.txt');

console.log(`Platform: ${electronPlatform}, Arch: ${electronArch}`);

// Create directories
if (!fs.existsSync(electronDir)) {
  fs.mkdirSync(electronDir, { recursive: true });
}
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Download URL
const filename = `electron-v${electronVersion}-${electronPlatform}-${electronArch}.zip`;
const url = `https://npmmirror.com/mirrors/electron/v${electronVersion}/${filename}`;
const zipPath = path.join(os.tmpdir(), filename);

console.log(`Downloading from: ${url}`);
console.log(`Saving to: ${zipPath}`);

// Download file
const file = fs.createWriteStream(zipPath);
https.get(url, (response) => {
  if (response.statusCode !== 200) {
    console.error(`Download failed: ${response.statusCode}`);
    process.exit(1);
  }
  
  response.pipe(file);
  file.on('finish', () => {
    file.close();
    console.log('Download complete!');
    console.log('Please manually extract the zip file to:', distDir);
    console.log('Then create a file at:', pathFile);
    console.log('With content:', platform === 'win32' ? 'electron.exe' : 'electron');
  });
}).on('error', (err) => {
  fs.unlinkSync(zipPath);
  console.error('Download error:', err.message);
});
