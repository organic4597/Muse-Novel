[CmdletBinding()]
param(
    [ValidateSet('Menu', 'Status', 'Validate', 'Start', 'Stop', 'Switch')]
    [string]$Action = 'Menu',
    [ValidateSet('story', 'image', 'ghost')]
    [string]$Model = 'story',
    [string]$ConfigPath = ''
)

$ErrorActionPreference = 'Stop'
if (-not $ConfigPath) { $ConfigPath = Join-Path $PSScriptRoot 'models.local.json' }

function Read-LauncherConfig {
    if (-not (Test-Path -LiteralPath $ConfigPath)) {
        if ($ConfigPath -ne (Join-Path $PSScriptRoot 'models.local.json')) {
            throw "Configuration file not found: $ConfigPath"
        }
        $script:ConfigPath = Join-Path $PSScriptRoot 'models.example.json'
    }
    $config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($config.distro -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') { throw 'Invalid WSL distro name.' }
    if ($config.timeoutSeconds -lt 10 -or $config.timeoutSeconds -gt 1800) { throw 'timeoutSeconds must be 10..1800.' }
    $ids = @($config.models | ForEach-Object { $_.id })
    if (($ids.Count -ne 3) -or (@($ids | Select-Object -Unique).Count -ne 3) -or
        (@($ids | Where-Object { $_ -notin @('story', 'image', 'ghost') }).Count -gt 0)) {
        throw 'Configure exactly one story, image and ghost entry.'
    }
    $services = @()
    foreach ($entry in $config.models) {
        if (-not $entry.service) { continue }
        if ($entry.service -notmatch '^[A-Za-z0-9][A-Za-z0-9_.@-]*\.service$') { throw 'Invalid service name.' }
        if ($entry.service -in $services) { throw 'Each model must have a separate service.' }
        $services += $entry.service
        foreach ($field in @('healthUrl', 'apiBaseUrl')) {
            $uri = $null
            if (-not [Uri]::TryCreate([string]$entry.$field, [UriKind]::Absolute, [ref]$uri) -or
                $uri.Scheme -notin @('http', 'https') -or $uri.UserInfo) {
                throw "$($entry.id): $field must be an HTTP(S) URL without embedded credentials."
            }
        }
    }
    return $config
}

function Invoke-WslCommand([string[]]$CommandArgs) {
    $result = & wsl.exe -d $script:Config.distro -u root --exec @CommandArgs 2>&1
    $code = $LASTEXITCODE
    if ($code -ne 0) { throw "WSL command failed ($code): $($result -join [Environment]::NewLine)" }
    return $result
}

function Get-ServiceState($Entry) {
    if (-not $Entry.service) { return 'not configured' }
    $state = & wsl.exe -d $script:Config.distro -u root --exec systemctl show $Entry.service --property=LoadState --value 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Unable to inspect WSL service: $($state -join ' ')" }
    if (($state -join '').Trim() -ne 'loaded') { return 'not installed' }
    $state = Invoke-WslCommand @('systemctl', 'show', $Entry.service, '--property=ActiveState', '--value')
    return ($state -join '').Trim()
}

function Test-ModelReady($Entry) {
    & wsl.exe -d $script:Config.distro -u root --exec curl --fail --silent --output /dev/null --max-time 3 $Entry.healthUrl 2>$null | Out-Null
    return $LASTEXITCODE -eq 0
}

function Show-Status {
    foreach ($entry in $script:Config.models) {
        $state = Get-ServiceState $entry
        if ($state -eq 'active') {
            if (Test-ModelReady $entry) { $state = 'READY' } else { $state = 'running / API not ready' }
        }
        Write-Host ('{0,-7} {1,-29} {2}' -f $entry.id, $state, $entry.label)
    }
}

function Stop-Model($Entry) {
    if (-not $Entry.service) { Write-Host 'Model is not configured.'; return }
    if ((Read-Host "Stop $($Entry.label)? Active requests will be interrupted. [y/N]") -ne 'y') { return }
    Invoke-WslCommand @('systemctl', 'stop', $Entry.service) | Out-Null
    Write-Host "Stopped: $($Entry.label)"
}

function Start-Model($Entry, [bool]$Exclusive) {
    $state = Get-ServiceState $Entry
    if ($state -in @('not configured', 'not installed')) {
        Write-Host "$($Entry.label): $state. Register an installed WSL service in models.local.json."
        return
    }
    $others = @($script:Config.models | Where-Object {
        $_.id -ne $Entry.id -and $_.service -and (Get-ServiceState $_) -in @('active', 'activating')
    })
    if ($others.Count -gt 0) {
        $names = ($others | ForEach-Object { $_.label }) -join ', '
        if ($Exclusive) {
            if ((Read-Host "Stop [$names] and switch? Active requests will be interrupted. [y/N]") -ne 'y') { return }
            foreach ($other in $others) { Invoke-WslCommand @('systemctl', 'stop', $other.service) | Out-Null }
        } elseif ((Read-Host "[$names] already running. Start together using more GPU memory? [y/N]") -ne 'y') {
            return
        }
    }
    Invoke-WslCommand @('systemctl', 'start', $Entry.service) | Out-Null
    $timer = [Diagnostics.Stopwatch]::StartNew()
    Write-Host "Waiting up to $($script:Config.timeoutSeconds) seconds for $($Entry.label)..."
    while ($timer.Elapsed.TotalSeconds -lt $script:Config.timeoutSeconds) {
        if (Test-ModelReady $Entry) {
            Write-Progress -Activity 'Model loading' -Completed
            Write-Host "READY: $($Entry.label)"
            Write-Host "API (inside WSL): $($Entry.apiBaseUrl)"
            Write-Host "Model: $($Entry.model)"
            Write-Host 'For Muse Novel on another machine, use the reachable Windows/WSL host address.'
            return
        }
        $current = Get-ServiceState $Entry
        if ($current -notin @('active', 'activating', 'reloading')) { break }
        Write-Progress -Activity 'Model loading' -Status ("{0}s elapsed - {1}" -f [int]$timer.Elapsed.TotalSeconds, $current)
        Start-Sleep -Seconds 2
    }
    Write-Progress -Activity 'Model loading' -Completed
    Write-Host 'API did not become ready. Service has NOT been stopped automatically.' -ForegroundColor Yellow
    & wsl.exe -d $script:Config.distro -u root --exec journalctl -u $Entry.service -n 25 --no-pager
    throw 'Model startup incomplete. Use Status or inspect service logs.'
}

try {
    $script:Config = Read-LauncherConfig
    if ($Action -eq 'Validate') { Write-Host 'Configuration OK'; exit 0 }
    if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) { throw 'WSL is not installed.' }
    $entry = $script:Config.models | Where-Object id -eq $Model
    switch ($Action) {
        'Status' { Show-Status; exit 0 }
        'Start' { Start-Model $entry $false; exit 0 }
        'Switch' { Start-Model $entry $true; exit 0 }
        'Stop' { Stop-Model $entry; exit 0 }
    }
    while ($true) {
        Write-Host "`nMuse Novel AI Launcher - $($script:Config.distro)"
        Show-Status
        Write-Host "`n1 Story LLM    2 Image AI    3 Ghost Text AI"
        Write-Host 'S Refresh status    G GPU memory    C Configuration    Q Exit'
        $choice = Read-Host 'Select'
        if ($choice -eq 'q') { break }
        if ($choice -eq 's') { continue }
        if ($choice -eq 'g') {
            Invoke-WslCommand @('nvidia-smi', '--query-gpu=name,memory.total,memory.used', '--format=csv,noheader') | Write-Host
            continue
        }
        if ($choice -eq 'c') {
            $localConfig = Join-Path $PSScriptRoot 'models.local.json'
            if (-not (Test-Path -LiteralPath $localConfig)) { Copy-Item -LiteralPath $ConfigPath -Destination $localConfig }
            Start-Process notepad.exe -ArgumentList ('"{0}"' -f $localConfig) -Wait
            $script:ConfigPath = $localConfig
            $script:Config = Read-LauncherConfig
            continue
        }
        if ($choice -notin @('1', '2', '3')) { continue }
        $id = @('story', 'image', 'ghost')[[int]$choice - 1]
        $entry = $script:Config.models | Where-Object id -eq $id
        Write-Host '1 Start    2 Switch (stop other registered models)    3 Stop    4 Logs    0 Back'
        try {
            switch (Read-Host 'Action') {
                '1' { Start-Model $entry $false }
                '2' { Start-Model $entry $true }
                '3' { Stop-Model $entry }
                '4' { if ($entry.service) { Invoke-WslCommand @('journalctl', '-u', $entry.service, '-n', '40', '--no-pager') | Write-Host } }
            }
        } catch { Write-Host $_.Exception.Message -ForegroundColor Red }
    }
    Write-Host 'Menu closed. Started systemd services continue running; use Stop to unload a model.'
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
