$version = "39.2.7"
$platform = "win32"
$arch = "x64"
$filename = "electron-v$version-$platform-$arch.zip"
$url = "https://npmmirror.com/mirrors/electron/v$version/$filename"
$tempDir = $env:TEMP
$zipPath = Join-Path $tempDir $filename
$targetDir = "node_modules\electron\dist"

Write-Host "Downloading Electron v$version..."
Write-Host "URL: $url"

try {
    Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
    Write-Host "Downloaded to: $zipPath"
    
    Write-Host "Extracting to: $targetDir"
    Expand-Archive -Path $zipPath -DestinationPath $targetDir -Force
    Write-Host "Extraction complete!"
    
    # Create path.txt
    "electron.exe" | Out-File -FilePath "node_modules\electron\path.txt" -Encoding utf8 -NoNewline
    Write-Host "Created path.txt"
    
    # Create index.js
    $indexContent = @'
const fs = require('fs');
const path = require('path');

const pathFile = path.join(__dirname, 'path.txt');

function getElectronPath() {
  if (fs.existsSync(pathFile)) {
    const executable = fs.readFileSync(pathFile, 'utf-8').trim();
    return path.join(__dirname, 'dist', executable);
  }
  throw new Error('Electron failed to install correctly');
}

module.exports = getElectronPath();
'@
    $indexContent | Out-File -FilePath "node_modules\electron\index.js" -Encoding utf8
    Write-Host "Created index.js"
    
    Write-Host "Electron installed successfully!"
} catch {
    Write-Error "Failed to install Electron: $_"
}
