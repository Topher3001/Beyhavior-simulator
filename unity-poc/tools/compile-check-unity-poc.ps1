param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$projectPath = Join-Path $ProjectRoot 'tools/compile-check/UnityPocCompileCheck.csproj'
$dotnetHome = Join-Path $ProjectRoot '.dotnet-home'
$nugetConfig = Join-Path $ProjectRoot 'tools/compile-check/NuGet.Config'
$appData = Join-Path $dotnetHome 'AppData/Roaming'
$localAppData = Join-Path $dotnetHome 'AppData/Local'

if (-not (Test-Path $projectPath)) {
    throw "Compile-check project not found: $projectPath"
}

New-Item -ItemType Directory -Force -Path $dotnetHome | Out-Null
New-Item -ItemType Directory -Force -Path $appData | Out-Null
New-Item -ItemType Directory -Force -Path $localAppData | Out-Null
$env:DOTNET_CLI_HOME = $dotnetHome
$env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE = '1'
$env:DOTNET_NOLOGO = '1'
$env:APPDATA = $appData
$env:LOCALAPPDATA = $localAppData
$env:NUGET_PACKAGES = Join-Path $dotnetHome 'nuget-packages'

dotnet build $projectPath --nologo --property:WarningLevel=0 --property:RestoreConfigFile="$nugetConfig"
