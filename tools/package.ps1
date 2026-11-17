$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'manifest.json') -Raw | ConvertFrom-Json
$files = @(
  'manifest.json', 'LICENSE', 'PRIVACY.md',
  'src/background/service-worker.js',
  'src/shared/money.js', 'src/shared/data-store.js', 'src/shared/price-extractor.js', 'src/shared/ui-mode.js',
  'src/popup/popup.html', 'src/popup/popup.css', 'src/popup/popup.js',
  'src/popup/format.js', 'src/popup/item-state.js', 'src/popup/settings.js', 'src/popup/capture.js', 'src/popup/folders.js', 'src/popup/products.js', 'src/popup/offers.js', 'src/popup/refresh.js', 'src/popup/site-locks.js', 'src/popup/backup.js', 'src/popup/dialogs.js',
  'src/dashboard/dashboard.html', 'src/dashboard/dashboard.css', 'src/dashboard/dashboard.js',
  'src/capture/quick-capture.html', 'src/capture/quick-capture.css', 'src/capture/quick-capture.js',
  'src/offscreen/offscreen.html', 'src/offscreen/offscreen.js',
  'assets/icons/icon-16.png', 'assets/icons/icon-32.png', 'assets/icons/icon-48.png', 'assets/icons/icon-128.png', 'assets/icons/radar.svg'
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
