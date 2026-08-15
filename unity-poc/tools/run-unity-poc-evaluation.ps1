param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$UnityExe = $env:UNITY_EXE,
    [string]$ReportPath = '',
    [double]$TrialSeconds = 14
)

$ErrorActionPreference = 'Stop'

function Find-UnityExecutable {
    param([string]$RequestedPath)

    if (-not [string]::IsNullOrWhiteSpace($RequestedPath) -and (Test-Path $RequestedPath)) {
        return (Resolve-Path $RequestedPath).Path
    }

    $command = Get-Command unity -ErrorAction SilentlyContinue
    if ($command -and $command.Source) {
        return $command.Source
    }

    $candidateRoots = @(
        "$env:ProgramFiles\Unity\Hub\Editor",
        "${env:ProgramFiles(x86)}\Unity\Hub\Editor"
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and (Test-Path $_) }

    foreach ($root in $candidateRoots) {
        $candidate = Get-ChildItem -Path $root -Recurse -Filter Unity.exe -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending |
            Select-Object -First 1
        if ($candidate) {
            return $candidate.FullName
        }
    }

    throw 'Unity executable was not found. Install Unity 2022.3 LTS or set UNITY_EXE to the full Unity.exe path.'
}

$UnityExe = Find-UnityExecutable $UnityExe
$ProjectRoot = (Resolve-Path $ProjectRoot).Path

if ([string]::IsNullOrWhiteSpace($ReportPath)) {
    $reportDirectory = Join-Path $ProjectRoot 'EvaluationReports'
    New-Item -ItemType Directory -Force -Path $reportDirectory | Out-Null
    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $ReportPath = Join-Path $reportDirectory "beyblade-unity-poc-evaluation-$timestamp.json"
}

$logPath = [System.IO.Path]::ChangeExtension($ReportPath, '.log')

Write-Host "Unity: $UnityExe"
Write-Host "Project: $ProjectRoot"
Write-Host "Report: $ReportPath"
Write-Host "Log: $logPath"
Write-Host "Mode: editor-headless Physics.Simulate"

& $UnityExe `
    -batchmode `
    -projectPath $ProjectRoot `
    -executeMethod BeybladePhysicsPoc.Editor.RunPocEvaluationBatch.Run `
    -logFile $logPath `
    -beybladePocReportPath $ReportPath `
    -beybladePocTrialSeconds $TrialSeconds

$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
    throw "Unity batch evaluation failed with exit code $exitCode. See log: $logPath"
}

if (-not (Test-Path $ReportPath)) {
    throw "Unity finished without creating the expected evaluation report: $ReportPath"
}

Write-Host "Evaluation report written to $ReportPath"
