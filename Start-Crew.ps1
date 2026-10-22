$ErrorActionPreference = 'Stop'
$crewRoot = $PSScriptRoot
try {
    $crewBun = (Get-Command bun -ErrorAction Stop).Source
    $crewMissing = @('node', 'git', 'uv', 'pi') | Where-Object { -not (Get-Command $_ -ErrorAction SilentlyContinue) }
    if ($crewMissing.Count) { throw ('Missing workflow tools: ' + ($crewMissing -join ', ') + '. See docs/learners-manual/index.html -> Installation.') }
    # Pin the port the launcher and origin check share. A generic PORT=0 from
    # the parent shell used to make Bun bind a random port the browser never used.
    $env:STUDIO_PORT = '4620'
    $crewUrl = 'http://127.0.0.1:4620'
    $crewRunning = $false
    try { $crewRunning = (Invoke-RestMethod "$crewUrl/api/health" -TimeoutSec 2).ok } catch {}
    if (-not $crewRunning) {
        if (-not (Test-Path -LiteralPath (Join-Path $crewRoot 'studio/dist/index.html'))) { throw "Crew needs its first build. See the Learner's Manual -> Installation." }
        $crewLogDir = Join-Path $crewRoot '.sssf/launcher'
        New-Item -ItemType Directory -Path $crewLogDir -Force | Out-Null
        $crewStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        Start-Process -FilePath $crewBun -ArgumentList @('run', 'server/index.ts') -WorkingDirectory (Join-Path $crewRoot 'studio') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $crewLogDir "$crewStamp-output.log") -RedirectStandardError (Join-Path $crewLogDir "$crewStamp-error.log") | Out-Null
        for ($crewAttempt = 0; $crewAttempt -lt 30; $crewAttempt++) {
            try { if ((Invoke-RestMethod "$crewUrl/api/health" -TimeoutSec 1).ok) { $crewRunning = $true; break } } catch {}
            Start-Sleep -Milliseconds 200
        }
        if (-not $crewRunning) { throw 'Crew did not start. Open the launcher logs in .sssf/launcher, or see Something Went Wrong in the manual.' }
    }
    Start-Process $crewUrl
} catch {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($_.Exception.Message, 'Crew Platform - startup') | Out-Null
}
