param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$OutputDirectory = Join-Path $ProjectRoot 'Assets/StreamingAssets/BeybladePoc'

function Format-Number([double]$Value) {
    return $Value.ToString('0.#####', [Globalization.CultureInfo]::InvariantCulture)
}

function New-Point([double]$Radius, [double]$Angle, [double]$Z) {
    return [pscustomobject]@{
        X = [Math]::Cos($Angle) * $Radius
        Y = [Math]::Sin($Angle) * $Radius
        Z = $Z
    }
}

function Add-Facet($Builder, $A, $B, $C) {
    [void]$Builder.AppendLine('  facet normal 0 0 0')
    [void]$Builder.AppendLine('    outer loop')
    [void]$Builder.AppendLine("      vertex $(Format-Number $A.X) $(Format-Number $A.Y) $(Format-Number $A.Z)")
    [void]$Builder.AppendLine("      vertex $(Format-Number $B.X) $(Format-Number $B.Y) $(Format-Number $B.Z)")
    [void]$Builder.AppendLine("      vertex $(Format-Number $C.X) $(Format-Number $C.Y) $(Format-Number $C.Z)")
    [void]$Builder.AppendLine('    endloop')
    [void]$Builder.AppendLine('  endfacet')
}

function Get-LobedRadius([double]$BaseRadius, [double]$Angle, [int]$AttackPoints, [double]$Strength, [double]$Bias) {
    $primary = [Math]::Max(0, [Math]::Cos($Angle * $AttackPoints))
    $secondary = [Math]::Sin($Angle * $AttackPoints * 2 + $AttackPoints) * 0.5 + 0.5
    $lobe = $primary * (0.35 + $Bias * 0.65) + $secondary * 0.18
    return $BaseRadius * (1 + $Strength * $lobe)
}

function Add-Frustum($Builder, [double]$BottomRadius, [double]$TopRadius, [double]$Z0, [double]$Z1, [int]$Segments) {
    $bottomCenter = [pscustomobject]@{ X = 0; Y = 0; Z = $Z0 }
    $topCenter = [pscustomobject]@{ X = 0; Y = 0; Z = $Z1 }

    for ($i = 0; $i -lt $Segments; $i++) {
        $angle = [Math]::PI * 2 * $i / $Segments
        $next = [Math]::PI * 2 * ($i + 1) / $Segments
        $bottomA = New-Point $BottomRadius $angle $Z0
        $bottomB = New-Point $BottomRadius $next $Z0
        $topA = New-Point $TopRadius $angle $Z1
        $topB = New-Point $TopRadius $next $Z1

        if ($BottomRadius -gt 0.001 -and $TopRadius -gt 0.001) {
            Add-Facet $Builder $bottomA $topA $topB
            Add-Facet $Builder $bottomA $topB $bottomB
        } elseif ($BottomRadius -le 0.001) {
            Add-Facet $Builder $bottomCenter $topA $topB
        } else {
            Add-Facet $Builder $bottomA $topCenter $bottomB
        }

        if ($BottomRadius -gt 0.001) {
            Add-Facet $Builder $bottomCenter $bottomB $bottomA
        }

        if ($TopRadius -gt 0.001) {
            Add-Facet $Builder $topCenter $topA $topB
        }
    }
}

function Add-AnnularLayer($Builder, [double]$InnerRadius, [double]$OuterRadius, [double]$Z0, [double]$Z1, [int]$Segments, [int]$AttackPoints, [double]$Strength, [double]$Bias) {
    for ($i = 0; $i -lt $Segments; $i++) {
        $angle = [Math]::PI * 2 * $i / $Segments
        $next = [Math]::PI * 2 * ($i + 1) / $Segments
        $outerBottomA = New-Point (Get-LobedRadius $OuterRadius $angle $AttackPoints $Strength $Bias) $angle $Z0
        $outerBottomB = New-Point (Get-LobedRadius $OuterRadius $next $AttackPoints $Strength $Bias) $next $Z0
        $outerTopA = New-Point (Get-LobedRadius ($OuterRadius * 0.96) $angle $AttackPoints $Strength $Bias) $angle $Z1
        $outerTopB = New-Point (Get-LobedRadius ($OuterRadius * 0.96) $next $AttackPoints $Strength $Bias) $next $Z1
        $innerBottomA = New-Point $InnerRadius $angle $Z0
        $innerBottomB = New-Point $InnerRadius $next $Z0
        $innerTopA = New-Point ($InnerRadius * 0.92) $angle $Z1
        $innerTopB = New-Point ($InnerRadius * 0.92) $next $Z1

        Add-Facet $Builder $outerBottomA $outerTopA $outerTopB
        Add-Facet $Builder $outerBottomA $outerTopB $outerBottomB
        Add-Facet $Builder $innerBottomA $innerTopB $innerTopA
        Add-Facet $Builder $innerBottomA $innerBottomB $innerTopB
        Add-Facet $Builder $innerTopA $outerTopA $outerTopB
        Add-Facet $Builder $innerTopA $outerTopB $innerTopB
        Add-Facet $Builder $innerBottomA $outerBottomB $outerBottomA
        Add-Facet $Builder $innerBottomA $innerBottomB $outerBottomB
    }
}

function New-SampleBeyStl([string]$Name, [double]$DiameterMm, [double]$HeightMm, [int]$AttackPoints, [double]$AttackBias, [string]$TipType) {
    $segments = 64
    $radius = [Math]::Max($DiameterMm / 2, 8)
    $height = [Math]::Max($HeightMm, 18)
    $builder = [Text.StringBuilder]::new()
    [void]$builder.AppendLine("solid $Name")

    if ($TipType -eq 'flat') {
        $tipBottom = $radius * 0.13
        $tipTop = $radius * 0.20
    } elseif ($TipType -eq 'sharp') {
        $tipBottom = $radius * 0.035
        $tipTop = $radius * 0.16
    } else {
        $tipBottom = $radius * 0.08
        $tipTop = $radius * 0.18
    }

    Add-Frustum $builder $tipBottom $tipTop 0 ($height * 0.15) $segments
    Add-Frustum $builder ($radius * 0.16) ($radius * 0.22) ($height * 0.13) ($height * 0.46) $segments
    Add-AnnularLayer $builder ($radius * 0.17) ($radius * 0.58) ($height * 0.39) ($height * 0.58) $segments $AttackPoints 0.05 0.35
    Add-AnnularLayer $builder ($radius * 0.34) ($radius * 0.91) ($height * 0.54) ($height * 0.83) $segments $AttackPoints 0.18 $AttackBias
    Add-AnnularLayer $builder ($radius * 0.42) ($radius * 0.98) ($height * 0.62) ($height * 0.77) $segments $AttackPoints 0.28 $AttackBias
    Add-Frustum $builder ($radius * 0.43) ($radius * 0.34) ($height * 0.68) ($height * 0.93) $segments
    Add-Frustum $builder ($radius * 0.2) ($radius * 0.16) ($height * 0.91) $height $segments

    [void]$builder.AppendLine("endsolid $Name")
    return $builder.ToString()
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
Set-Content -Path (Join-Path $OutputDirectory 'left.stl') -Value (New-SampleBeyStl 'left_attack_sample' 49 40 3 0.82 'flat') -Encoding ascii
Set-Content -Path (Join-Path $OutputDirectory 'right.stl') -Value (New-SampleBeyStl 'right_stamina_sample' 47 38 6 0.22 'sharp') -Encoding ascii

Write-Host "Generated sample STL assets in $OutputDirectory"
