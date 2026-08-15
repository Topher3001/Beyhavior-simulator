param(
    [Parameter(Mandatory = $true)]
    [string]$ReportPath
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $ReportPath)) {
    throw "Evaluation report not found: $ReportPath"
}

$report = Get-Content $ReportPath -Raw | ConvertFrom-Json
if ($report.schema -ne 'beyblade-simulator.unity-poc-evaluation.v1') {
    throw "Unexpected report schema: $($report.schema)"
}

$trials = @($report.trials)
if ($trials.Count -lt 1) {
    throw 'Evaluation report has no trials.'
}

function Add-Warning($Warnings, [string]$Message) {
    if (-not [string]::IsNullOrWhiteSpace($Message)) {
        [void]$Warnings.Add($Message)
    }
}

function Get-TrialScore($Trial) {
    $score = 100.0
    $score -= [double]$Trial.bounceRiskSampleRatio * 180
    $score -= [Math]::Max(0, ([double]$Trial.maxHeightAboveSurface - 0.65)) * 25
    $score -= [double]$Trial.rimSampleRatio * 40
    $score += [double]$Trial.centerContactSampleRatio * 20
    $score += [Math]::Min([double]$Trial.totalCollisions, 20) * 0.75
    $score -= [Math]::Max(0, ([double]$Trial.maxTiltDegrees - 55)) * 0.8
    return [Math]::Round([Math]::Max(0, [Math]::Min(100, $score)), 1)
}

function Get-EndRpm($Trial) {
    return ([double]$Trial.endState.leftRpm + [double]$Trial.endState.rightRpm) / 2
}

$scored = foreach ($trial in $trials) {
    [pscustomobject]@{
        Name = [string]$trial.name
        Score = Get-TrialScore $trial
        BounceRisk = [double]$trial.bounceRiskSampleRatio
        MaxHeight = [double]$trial.maxHeightAboveSurface
        RimRatio = [double]$trial.rimSampleRatio
        CenterRatio = [double]$trial.centerContactSampleRatio
        Collisions = [int]$trial.totalCollisions
        MaxTilt = [double]$trial.maxTiltDegrees
        AvgEndRpm = [Math]::Round((Get-EndRpm $trial), 0)
    }
}

$best = $scored | Sort-Object Score -Descending | Select-Object -First 1
$raw = $scored | Where-Object { $_.Name -eq 'raw-physx' } | Select-Object -First 1
$assisted = $scored | Where-Object { $_.Name -eq 'assisted-bowl-gyro' } | Select-Object -First 1
$warnings = New-Object System.Collections.Generic.List[string]
$trialNames = @($scored | ForEach-Object { $_.Name })

foreach ($requiredTrial in @('raw-physx', 'gyro-only', 'assisted-bowl-gyro')) {
    if ($trialNames -notcontains $requiredTrial) {
        Add-Warning $warnings "Missing expected trial: $requiredTrial"
    }
}

foreach ($trial in $trials) {
    $name = [string]$trial.name
    $sampleCount = [int]$trial.sampleCount
    $durationSeconds = [double]$trial.durationSeconds
    $minTopDistance = [double]$trial.minTopDistance
    $maxRadius = [double]$trial.maxRadius
    $maxHeight = [double]$trial.maxHeightAboveSurface
    $avgEndRpm = Get-EndRpm $trial

    if ($sampleCount -lt 800) {
        Add-Warning $warnings "$name has too few samples ($sampleCount); batch run may have ended early."
    }

    if ($durationSeconds -lt ([double]$report.trialSeconds * 0.85)) {
        Add-Warning $warnings "$name duration is shorter than expected ($durationSeconds seconds)."
    }

    if ($minTopDistance -le 0.05) {
        Add-Warning $warnings "$name minTopDistance is near zero; launch poses may be wrong or tops may overlap."
    } elseif ($minTopDistance -gt 1.6) {
        Add-Warning $warnings "$name never gets close enough for a meaningful bey-to-bey contact."
    }

    if ($maxRadius -lt 1.2) {
        Add-Warning $warnings "$name maxRadius is very small; tops may not have launched into the stadium."
    }

    if ($maxHeight -gt 1.2) {
        Add-Warning $warnings "$name shows high bounce above the stadium surface ($maxHeight)."
    }

    if ($avgEndRpm -lt 250) {
        Add-Warning $warnings "$name ends with extremely low RPM; launch spin may not have applied."
    }
}

Write-Host "Unity POC Evaluation Summary"
Write-Host "Report: $((Resolve-Path $ReportPath).Path)"
Write-Host "Created: $($report.createdAt)"
Write-Host "Trial seconds: $($report.trialSeconds)"
Write-Host ''

$scored |
    Sort-Object Score -Descending |
    Format-Table Name, Score, BounceRisk, MaxHeight, RimRatio, CenterRatio, Collisions, MaxTilt, AvgEndRpm -AutoSize

Write-Host ''
Write-Host "Best trial: $($best.Name) ($($best.Score)/100)"

if ($warnings.Count -gt 0) {
    Write-Host ''
    Write-Host 'Validity warnings:'
    foreach ($warning in $warnings) {
        Write-Host "- $warning"
    }
    Write-Host ''
    Write-Host 'Trust hint: Treat this report as diagnostic, not decisive, until the warnings are explained.'
}

if ($raw -and $assisted) {
    $improvement = [Math]::Round($assisted.Score - $raw.Score, 1)
    Write-Host "Assisted vs raw score delta: $improvement"

    if ($raw.Score -ge 78 -and $raw.BounceRisk -le 0.02 -and $improvement -lt 10) {
        Write-Host 'Decision hint: Raw PhysX looks promising. Try reducing custom assists and compare feel manually.'
    } elseif ($assisted.Score -ge 78 -and $improvement -ge 10) {
        Write-Host 'Decision hint: Unity may be useful with light Beyblade-specific assists, but native PhysX alone is not enough.'
    } elseif ($best.Score -lt 65) {
        Write-Host 'Decision hint: Unity POC still needs physics tuning before migration is justified.'
    } else {
        Write-Host 'Decision hint: Results are mixed. Use manual Play Mode feel plus CSV telemetry before choosing a migration path.'
    }
} else {
    Write-Host 'Decision hint: Missing raw or assisted trial; rerun the full batch evaluation.'
}
