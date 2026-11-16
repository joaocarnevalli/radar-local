$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'manifest.json') -Raw | ConvertFrom-Json
$files = @(
  'manifest.json', 'background.js', 'money.js', 'data-store.js', 'price-extractor.js',
  'popup.html', 'popup.css', 'popup.js', 'ui-mode.js',
  'dashboard.html', 'dashboard.css', 'dashboard.js',
  'quick-capture.html', 'quick-capture.css', 'quick-capture.js',
  'offscreen.html', 'offscreen.js', 'LICENSE', 'PRIVACY.md',
  'icons/icon-16.png', 'icons/icon-32.png', 'icons/icon-48.png', 'icons/icon-128.png', 'icons/radar.svg'
)
$outputDirectory = Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$zipPath = Join-Path $outputDirectory ("radar-local-{0}-chrome-web-store.zip" -f $manifest.version)
$temporaryZip = Join-Path $outputDirectory ([Guid]::NewGuid().ToString() + '.zip')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::Open($temporaryZip, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($relative in $files) {
    $source = Join-Path $projectRoot $relative
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing package file: $relative" }
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $source, $relative, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $archive.Dispose() }
$check = [IO.Compression.ZipFile]::OpenRead($temporaryZip)
try {
  $names = @($check.Entries | ForEach-Object FullName)
  if ($names.Count -ne $files.Count -or 'manifest.json' -notin $names) { throw 'Package structure is invalid.' }
  foreach ($entry in $names) { if ($entry -notin $files) { throw "Unexpected package entry: $entry" } }
} finally { $check.Dispose() }
Move-Item -LiteralPath $temporaryZip -Destination $zipPath -Force
$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
Set-Content -LiteralPath ($zipPath + '.sha256') -Value ($hash + '  ' + [IO.Path]::GetFileName($zipPath)) -Encoding ascii
Write-Output ("Package: {0}`nFiles: {1}`nBytes: {2}`nSHA256: {3}" -f $zipPath, $files.Count, (Get-Item -LiteralPath $zipPath).Length, $hash)
