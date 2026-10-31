const path = require('path');
const { execSync } = require('child_process');

const targetExe = path.resolve(__dirname, '..', 'release', 'win-unpacked', 'IRIS.exe');
const workingDir = path.resolve(__dirname, '..', 'release', 'win-unpacked');

const ps = `
$desktop = [System.Environment]::GetFolderPath('Desktop')
foreach ($name in @('IRIS.lnk', 'IRIS AI.lnk')) {
  $lnkPath = Join-Path $desktop $name
  $ws = New-Object -ComObject WScript.Shell
  $s = $ws.CreateShortcut($lnkPath)
  $s.TargetPath = '${targetExe.replace(/\\/g, '\\\\')}'
  $s.WorkingDirectory = '${workingDir.replace(/\\/g, '\\\\')}'
  $s.Save()
  Write-Output "Updated shortcut: $lnkPath"
}
`;

const res = execSync(`powershell -NoProfile -Command "${ps.replace(/\r?\n/g, '; ')}"`, { encoding: 'utf-8' });
console.log(res);
