# Set your real GitHub OAuth Client Secret (from GitHub Developer Settings)
# Usage:
#   .\scripts\set-github-oauth-secret.ps1
#   .\scripts\set-github-oauth-secret.ps1 -Secret "ghp_xxxxxxxx"

param(
  [Parameter(Mandatory = $false)]
  [string]$Secret
)

$ErrorActionPreference = "Stop"

if (-not $Secret) {
  Write-Host ""
  Write-Host "GitHub OAuth Client Secret setup" -ForegroundColor Cyan
  Write-Host "--------------------------------"
  Write-Host "1. Open: https://github.com/settings/developers"
  Write-Host "2. Click your OAuth App (Client ID should be Ov23lixie3I0seKa7A2t)"
  Write-Host "3. Generate / copy the Client Secret"
  Write-Host "4. Paste it below (input is hidden)"
  Write-Host ""
  $Secret = Read-Host "GitHub Client Secret" -AsSecureString
  $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
  $Secret = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
}

if ([string]::IsNullOrWhiteSpace($Secret) -or $Secret -eq "your_client_secret") {
  Write-Host "Error: A valid client secret is required." -ForegroundColor Red
  exit 1
}

Write-Host "Setting GITHUB_OAUTH_CLIENT_SECRET in Supabase..." -ForegroundColor Yellow
supabase secrets set "GITHUB_OAUTH_CLIENT_ID=Ov23lixie3I0seKa7A2t"
supabase secrets set "GITHUB_OAUTH_CLIENT_SECRET=$Secret"

Write-Host ""
Write-Host "Done! Restart npm run dev and try Connect GitHub again." -ForegroundColor Green
