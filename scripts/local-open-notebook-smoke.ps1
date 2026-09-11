$ErrorActionPreference = "Stop"
$healthUrl = "http://127.0.0.1:15055/health"
$openApiUrl = "http://127.0.0.1:15055/openapi.json"
$docsUrl = "http://127.0.0.1:15055/docs"
$uiUrl = "http://127.0.0.1:18502"
$repoRoot = Split-Path -Parent $PSScriptRoot
$outputPath = Join-Path $repoRoot "openapi/openapi.json"

function Wait-WebResponse([string]$Url, [int]$TimeoutSec = 15) {
    $deadline = (Get-Date).AddMinutes(5)
    do {
        try {
            return Invoke-WebRequest -Uri $Url -TimeoutSec $TimeoutSec -UseBasicParsing
        } catch {
            if ((Get-Date) -ge $deadline) {
                throw "5分以内にHTTP接続できませんでした: $Url"
            }
            Start-Sleep -Seconds 5
        }
    } while ($true)
}

$health = Wait-WebResponse -Url $healthUrl -TimeoutSec 5
$ui = Wait-WebResponse -Url $uiUrl
$docs = Wait-WebResponse -Url $docsUrl
$openApi = Wait-WebResponse -Url $openApiUrl -TimeoutSec 30
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outputPath) | Out-Null
[System.IO.File]::WriteAllText($outputPath, $openApi.Content, [System.Text.UTF8Encoding]::new($false))
$digest = (Get-FileHash -Algorithm SHA256 -Path $outputPath).Hash.ToLowerInvariant()

Write-Host "Open Notebook health: OK"
Write-Host "Open Notebook UI HTTP status: $($ui.StatusCode)"
Write-Host "Open Notebook docs HTTP status: $($docs.StatusCode)"
Write-Host "OpenAPI saved: $outputPath"
Write-Host "OpenAPI SHA-256: $digest"
