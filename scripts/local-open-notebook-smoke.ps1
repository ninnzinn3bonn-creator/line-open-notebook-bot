$ErrorActionPreference = "Stop"
$healthUrl = "http://127.0.0.1:15055/health"
$openApiUrl = "http://127.0.0.1:15055/openapi.json"
$docsUrl = "http://127.0.0.1:15055/docs"
$uiUrl = "http://127.0.0.1:18502"
$repoRoot = Split-Path -Parent $PSScriptRoot
$outputPath = Join-Path $repoRoot "openapi/openapi.json"

$deadline = (Get-Date).AddMinutes(5)
do {
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 5
        break
    } catch {
        if ((Get-Date) -ge $deadline) {
            throw "Open Notebook health checkが5分以内に成功しませんでした: $healthUrl"
        }
        Start-Sleep -Seconds 5
    }
} while ($true)

$ui = Invoke-WebRequest -Uri $uiUrl -TimeoutSec 15 -UseBasicParsing
$docs = Invoke-WebRequest -Uri $docsUrl -TimeoutSec 15 -UseBasicParsing
$openApi = Invoke-WebRequest -Uri $openApiUrl -TimeoutSec 30 -UseBasicParsing
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outputPath) | Out-Null
[System.IO.File]::WriteAllText($outputPath, $openApi.Content, [System.Text.UTF8Encoding]::new($false))
$digest = (Get-FileHash -Algorithm SHA256 -Path $outputPath).Hash.ToLowerInvariant()

Write-Host "Open Notebook health: OK"
Write-Host "Open Notebook UI HTTP status: $($ui.StatusCode)"
Write-Host "Open Notebook docs HTTP status: $($docs.StatusCode)"
Write-Host "OpenAPI saved: $outputPath"
Write-Host "OpenAPI SHA-256: $digest"
