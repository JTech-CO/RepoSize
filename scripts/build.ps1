# RepoSize — reliable Windows build.
#
# Node 25.x on Windows sporadically crashes the Vite/esbuild native toolchain
# with exit code 0xC0000409 (a runtime instability, not a build error). This
# retries the build at the shell level — the pattern that survives it — until a
# clean run succeeds. For a permanently stable setup, use a Node LTS release
# (22 or 24), where `npm run build` works directly.
#
# Usage (from a PowerShell prompt in the project root):
#   powershell -ExecutionPolicy Bypass -File scripts/build.ps1

$ErrorActionPreference = 'Continue'
$max = 8

for ($i = 1; $i -le $max; $i++) {
    Write-Host "== RepoSize build - attempt $i/$max =="
    Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
    npx vite build
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "Build succeeded on attempt $i. Output is in dist/."
        exit 0
    }
    Write-Host "Attempt $i failed (exit $LASTEXITCODE) - retrying..."
    Write-Host ""
}

Write-Host "Build failed after $max attempts."
Write-Host "Node 25 is unstable for this toolchain; please use Node LTS (22 or 24)."
exit 1
