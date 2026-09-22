param(
    [ValidateSet("init", "pull", "up", "status", "smoke", "logs", "down", "reset")]
    [string]$Command = "status"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $repoRoot "docker-compose.local-poc.yml"
$envFile = Join-Path $repoRoot ".env.local-poc"
$projectName = "line-open-notebook-local-poc"
$dockerCommand = $null

function New-RandomSecret([int]$ByteCount = 32) {
    $bytes = New-Object byte[] $ByteCount
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return [Convert]::ToBase64String($bytes)
}

function Assert-Docker {
    $dockerLookup = Get-Command docker -ErrorAction SilentlyContinue
    if ($dockerLookup) {
        $script:dockerCommand = $dockerLookup.Source
    }
    if (-not $script:dockerCommand) {
        $installedDocker = Join-Path $env:ProgramFiles "Docker\Docker\resources\bin\docker.exe"
        if (Test-Path $installedDocker) {
            $script:dockerCommand = $installedDocker
        }
    }
    if (-not $script:dockerCommand) {
        throw "Docker CLIが見つかりません。Docker Desktopをインストールしてください。"
    }
    & $script:dockerCommand info *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Engineが起動していません。WSL 2を有効化し、Docker Desktopを起動してください。"
    }
}

function Invoke-Compose([string[]]$Arguments) {
    & $script:dockerCommand compose --project-name $projectName --env-file $envFile -f $composeFile @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose が終了コード $LASTEXITCODE で失敗しました。"
    }
}

Push-Location $repoRoot
try {
    if ($Command -eq "init") {
        if (Test-Path $envFile) {
            Write-Host ".env.local-poc は既に存在します。変更しません。"
        } else {
            @(
                "OPEN_NOTEBOOK_VERSION=1.14.0"
                "SURREAL_USER=root"
                "SURREAL_PASSWORD=$(New-RandomSecret)"
                "OPEN_NOTEBOOK_ENCRYPTION_KEY=$(New-RandomSecret)"
            ) | Set-Content -Path $envFile -Encoding utf8NoBOM
            Write-Host "ローカル専用の認証情報を .env.local-poc に生成しました。"
        }
        exit 0
    }

    Assert-Docker
    if (-not (Test-Path $envFile)) {
        throw "先に .\scripts\local-poc.ps1 init を実行してください。"
    }

    switch ($Command) {
        "pull"   { Invoke-Compose @("pull") }
        "up"     { Invoke-Compose @("up", "-d", "--wait") }
        "status" { Invoke-Compose @("ps") }
        "smoke"  { & (Join-Path $PSScriptRoot "local-open-notebook-smoke.ps1") }
        "logs"   { Invoke-Compose @("logs", "--tail", "200") }
        "down"   { Invoke-Compose @("down") }
        "reset"  { Invoke-Compose @("down", "--volumes", "--remove-orphans") }
    }
} finally {
    Pop-Location
}
