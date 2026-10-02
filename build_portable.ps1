$ErrorActionPreference = "Stop"

$root = "d:\Weather Station"
$standaloneDir = Join-Path $root "WeatherStationHub-Standalone"
$buildDir = Join-Path $root "portable_build_dir"
$payloadZip = Join-Path $root "payload.zip"
$outputExe = Join-Path $root "WeatherStationHub-Portable.exe"
$csFile = Join-Path $root "WeatherStationHubPortable.cs"
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$nodeSystem = "C:\Program Files\nodejs\node.exe"

Write-Host "======================================================="
Write-Host "  Building Self-Contained WeatherStationHub-Portable.exe"
Write-Host "======================================================="

if (Test-Path $buildDir) { Remove-Item $buildDir -Recurse -Force }
if (Test-Path $payloadZip) { Remove-Item $payloadZip -Force }

Write-Host "[1/4] Preparing payload directory structure..."
New-Item -ItemType Directory -Path $buildDir | Out-Null
Copy-Item -Path "$standaloneDir\*" -Destination $buildDir -Recurse -Force

Write-Host "[2/4] Bundling portable node.exe binary..."
$targetNode = Join-Path $buildDir "node.exe"
if (-not (Test-Path $targetNode)) {
    if (Test-Path $nodeSystem) {
        Copy-Item -Path $nodeSystem -Destination $targetNode -Force
        Write-Host "      Copied system node.exe into payload."
    } else {
        throw "Could not find node.exe at $nodeSystem"
    }
}

Write-Host "[3/4] Compressing payload archive into payload.zip..."
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($buildDir, $payloadZip)

Write-Host "[4/4] Compiling 100% self-contained single-file executable..."
$iconPath = Join-Path $root "public\favicon.ico"
$args = @(
    "/target:winexe",
    "/optimize+",
    "/win32icon:$iconPath",
    "/out:$outputExe",
    "/resource:$payloadZip,WeatherStationHubApp.payload.zip",
    "/r:System.Windows.Forms.dll",
    "/r:System.Drawing.dll",
    "/r:System.IO.Compression.dll",
    "/r:System.IO.Compression.FileSystem.dll",
    "$csFile"
)

& $csc $args

if (Test-Path $outputExe) {
    $sizeMb = [math]::Round((Get-Item $outputExe).Length / 1MB, 2)
    Write-Host "======================================================="
    Write-Host "✅ SUCCESS! Single Portable Executable Created:"
    Write-Host "   Path: $outputExe"
    Write-Host "   Size: $sizeMb MB"
    Write-Host "======================================================="
} else {
    throw "Compilation failed to produce $outputExe"
}

# Cleanup temporary build files
if (Test-Path $buildDir) { Remove-Item $buildDir -Recurse -Force }
if (Test-Path $payloadZip) { Remove-Item $payloadZip -Force }
