param(
  [string]$BaseUrl = "http://localhost:5055",
  [string]$OutputPath = "openapi/openapi.json"
)

$ErrorActionPreference = "Stop"
$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$health = Invoke-RestMethod -Uri "$BaseUrl/health"
Invoke-WebRequest -Uri "$BaseUrl/openapi.json" -OutFile $OutputPath
$document = Get-Content -LiteralPath $OutputPath -Raw | ConvertFrom-Json
[pscustomobject]@{
  Health = $health.status
  ApiTitle = $document.info.title
  ApiVersion = $document.info.version
  PathCount = $document.paths.psobject.Properties.Count
  SavedTo = (Resolve-Path -LiteralPath $OutputPath).Path
}

