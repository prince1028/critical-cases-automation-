# Verifies every analytics query against a real database by requesting the real routes.
# Catches SQL errors (syntax, wrong column, WHERE/WHERE) that unit tests cannot.
#
#   npm run check:sql          # starts a server on the .env.e2e branch, then stops it
#   npm run check:sql -- url   # check an already-running server instead

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Read-DotEnv($file) {
  $out = @{}
  foreach ($line in (Get-Content $file -ErrorAction SilentlyContinue)) {
    if ($line -match '^([A-Z_]+)=(.*)$') { $out[$Matches[1]] = $Matches[2] }
  }
  return $out
}

$e2e = Read-DotEnv '.env.e2e'
if (-not $e2e.DATABASE_URL) { throw '.env.e2e with DATABASE_URL is required' }
if ($e2e.DATABASE_URL -eq (Read-DotEnv '.env').DATABASE_URL) { throw 'Refusing: .env.e2e is the production database' }

$own = -not $args[0]
$base = if ($own) { 'http://localhost:3199' } else { $args[0].TrimEnd('/') }
$server = $null

if ($own) {
  $env:ANALYTICS_MVP = 'true'
  $env:ANALYTICS_MVP_BYPASS_AUTH = 'true'
  $env:DATABASE_URL = $e2e.DATABASE_URL
  $env:SESSION_SECRET = $e2e.SESSION_SECRET
  $server = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npx next start -p 3199 > NUL 2>&1' -PassThru -WindowStyle Hidden
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    try { Invoke-WebRequest "$base/login" -TimeoutSec 2 | Out-Null; break } catch { }
  }
}

# Every drilldown a dashboard card, chart column or review reason can link with.
$paths = @(
  '/analytics'
  '/analytics?range=30d'
  '/analytics?range=90d'
  '/analytics?range=12m'
  '/analytics?range=all'
  '/analytics?range=all&source=app'
  '/analytics?range=all&source=whatsapp'
  '/analytics?range=bogus'
  '/analytics?open=1&range=all'
  '/analytics?vendor=Modi&range=all'
  '/analytics?vendor=%25&range=all'
  '/analytics?resolver=Ravi&range=all'
  '/analytics?resolver=%25%27+OR+1%3D1--&range=all'
  '/analytics?reporter=Asha&range=all'
  '/analytics?review=1&reason=MISSING_TILE_CODE&range=all'
  '/analytics?status=RESOLVED&range=all'
  '/analytics?issue=WATER_LEAK&range=all'
  '/analytics?tile=A-101&range=all'
  '/analytics?bucket=2026-10-01&bucketRange=month'
  '/analytics?bucket=notadate&bucketRange=nope'
  '/analytics?from=2026-01-01&to=2026-01-31'
  '/analytics?q=1049&range=all'
  '/analytics?page=2&range=all'
  '/analytics?page=-5&range=all'
  '/analytics?range=all&open=1&vendor=Modi&resolver=Ravi&q=1049'
)

$failed = 0
foreach ($path in $paths) {
  try {
    $r = Invoke-WebRequest "$base$path" -TimeoutSec 30
    $status = [int]$r.StatusCode
    $broke = $r.Content -match 'Something went wrong'
    if ($status -eq 200 -and -not $broke) {
      Write-Host "  PASS  $path" -ForegroundColor DarkGreen
    } else {
      $failed++
      Write-Host "  FAIL  $path  -> HTTP $status$(if ($broke) { ' (error page)' })" -ForegroundColor Red
    }
  } catch {
    $failed++
    Write-Host "  FAIL  $path  -> $($_.Exception.Message)" -ForegroundColor Red
  }
}

if ($own -and $server) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }

Write-Host ''
if ($failed) { Write-Host "$failed of $($paths.Count) routes failed." -ForegroundColor Red; exit 1 }
Write-Host "All $($paths.Count) routes rendered." -ForegroundColor Green