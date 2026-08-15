param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

$requiredFiles = @(
    'Packages/manifest.json',
    'ProjectSettings/ProjectVersion.txt',
    'ProjectSettings/TagManager.asset',
    'Assets/Scripts/BeybladePocBootstrap.cs',
    'Assets/Scripts/BeybladePocRunner.cs',
    'Assets/Scripts/BeybladeTopController.cs',
    'Assets/Scripts/PocEvaluationRunner.cs',
    'Assets/Scripts/PocTelemetryRecorder.cs',
    'Assets/Scripts/SimpleStlMeshLoader.cs',
    'Assets/Scripts/StadiumBowl.cs',
    'Assets/StreamingAssets/BeybladePoc/README.md',
    'Assets/StreamingAssets/BeybladePoc/left.stl',
    'Assets/StreamingAssets/BeybladePoc/right.stl',
    'Assets/Editor/CreateBeybladePocScene.cs',
    'Assets/Editor/RunPocEvaluationBatch.cs',
    'EvaluationReports/sample-evaluation-report.json',
    'EvaluationReports/sample-invalid-evaluation-report.json',
    'tools/compile-check/NuGet.Config',
    'tools/compile-check/UnityPocCompileCheck.csproj',
    'tools/compile-check/UnityStubs.cs',
    'tools/compile-check-unity-poc.ps1',
    'tools/generate-sample-stl-assets.ps1',
    'tools/run-unity-poc-evaluation.ps1',
    'tools/summarize-unity-poc-evaluation.ps1'
)

$failures = New-Object System.Collections.Generic.List[string]

foreach ($relativePath in $requiredFiles) {
    $path = Join-Path $ProjectRoot $relativePath
    if (-not (Test-Path $path)) {
        $failures.Add("Missing required file: $relativePath")
    }
}

$scriptFiles = Get-ChildItem (Join-Path $ProjectRoot 'Assets') -Recurse -Filter '*.cs'
foreach ($file in $scriptFiles) {
    $text = Get-Content $file.FullName -Raw
    $openBraces = ([regex]::Matches($text, '\{')).Count
    $closeBraces = ([regex]::Matches($text, '\}')).Count
    $openParens = ([regex]::Matches($text, '\(')).Count
    $closeParens = ([regex]::Matches($text, '\)')).Count

    if ($openBraces -ne $closeBraces) {
        $failures.Add("$($file.Name) has unbalanced braces: $openBraces/$closeBraces")
    }

    if ($openParens -ne $closeParens) {
        $failures.Add("$($file.Name) has unbalanced parentheses: $openParens/$closeParens")
    }

    if ($text -match 'new\(\)') {
        $failures.Add("$($file.Name) uses target-typed new(); keep syntax conservative for Unity 2022 LTS.")
    }
}

$topControllerText = Get-Content (Join-Path $ProjectRoot 'Assets/Scripts/BeybladeTopController.cs') -Raw
$runnerText = Get-Content (Join-Path $ProjectRoot 'Assets/Scripts/BeybladePocRunner.cs') -Raw
if ($topControllerText -notmatch 'public void SetLaunchPose') {
    $failures.Add("BeybladeTopController.cs must expose SetLaunchPose for editor-headless batch runs.")
}

if ($runnerText -notmatch 'top\.SetLaunchPose\(root\.transform\.position, root\.transform\.rotation\)') {
    $failures.Add("BeybladePocRunner.cs must set launch poses explicitly after creating tops.")
}

foreach ($sampleStl in @('Assets/StreamingAssets/BeybladePoc/left.stl', 'Assets/StreamingAssets/BeybladePoc/right.stl')) {
    $path = Join-Path $ProjectRoot $sampleStl
    if (-not (Test-Path $path)) {
        continue
    }

    $text = Get-Content $path -Raw
    $vertexMatches = [regex]::Matches($text, '^\s*vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s*$', 'Multiline')
    $vertexCount = $vertexMatches.Count
    $facetCount = ([regex]::Matches($text, '^\s*facet\s+normal\s+', 'Multiline')).Count
    if ($vertexCount -lt 3 -or $vertexCount % 3 -ne 0) {
        $failures.Add("$sampleStl has an invalid STL vertex count: $vertexCount")
    }

    if ($facetCount -ne ($vertexCount / 3)) {
        $failures.Add("$sampleStl facet count does not match vertex count: $facetCount facets, $vertexCount vertices")
    }

    if ($vertexCount -gt 0) {
        $minX = [double]::PositiveInfinity
        $minY = [double]::PositiveInfinity
        $minZ = [double]::PositiveInfinity
        $maxX = [double]::NegativeInfinity
        $maxY = [double]::NegativeInfinity
        $maxZ = [double]::NegativeInfinity

        foreach ($match in $vertexMatches) {
            $x = [double]::Parse($match.Groups[1].Value, [Globalization.CultureInfo]::InvariantCulture)
            $y = [double]::Parse($match.Groups[2].Value, [Globalization.CultureInfo]::InvariantCulture)
            $z = [double]::Parse($match.Groups[3].Value, [Globalization.CultureInfo]::InvariantCulture)
            $minX = [Math]::Min($minX, $x)
            $minY = [Math]::Min($minY, $y)
            $minZ = [Math]::Min($minZ, $z)
            $maxX = [Math]::Max($maxX, $x)
            $maxY = [Math]::Max($maxY, $y)
            $maxZ = [Math]::Max($maxZ, $z)
        }

        if (($maxX - $minX) -lt 10 -or ($maxY - $minY) -lt 10 -or ($maxZ - $minZ) -lt 10) {
            $failures.Add("$sampleStl bounds look too small for a Beyblade sample.")
        }
    }
}

$manifest = Get-Content (Join-Path $ProjectRoot 'Packages/manifest.json') -Raw | ConvertFrom-Json
foreach ($module in @('com.unity.modules.physics', 'com.unity.modules.audio', 'com.unity.modules.imgui', 'com.unity.modules.inputlegacy')) {
    if (-not $manifest.dependencies.PSObject.Properties.Name.Contains($module)) {
        $failures.Add("manifest.json is missing $module")
    }
}

$sampleReportPaths = @(
    'EvaluationReports/sample-evaluation-report.json',
    'EvaluationReports/sample-invalid-evaluation-report.json'
)

foreach ($sampleReportRelativePath in $sampleReportPaths) {
    $sampleReportPath = Join-Path $ProjectRoot $sampleReportRelativePath
    if (-not (Test-Path $sampleReportPath)) {
        continue
    }

    try {
        $sampleReport = Get-Content $sampleReportPath -Raw | ConvertFrom-Json
        if ($sampleReport.schema -ne 'beyblade-simulator.unity-poc-evaluation.v1') {
            $failures.Add("$sampleReportRelativePath has unexpected schema: $($sampleReport.schema)")
        }

        if (@($sampleReport.trials).Count -lt 1) {
            $failures.Add("$sampleReportRelativePath should include at least one trial")
        }
    } catch {
        $failures.Add("$sampleReportRelativePath is not valid JSON: $($_.Exception.Message)")
    }
}

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Host "Unity POC scaffold validation passed."
Write-Host "Note: This does not compile UnityEngine APIs; open unity-poc/ in Unity 2022.3 LTS or newer for editor validation."
Write-Host "Optional: run tools/compile-check-unity-poc.ps1 for a local C# compile check against Unity API stubs."
