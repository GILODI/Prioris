# Échanges avec Supabase pour la synchronisation.
# Utilise la clé publique et le jeton de synchronisation du fichier .env local : le jeton permet
# seulement de lister les messages déjà importés et d'en ajouter. Il n'est jamais affiché.
#   -Action check   : vérifie la connexion et le jeton
#   -Action keys    : écrit la liste des messages déjà importés (source_key) dans -Out
#   -Action insert  : envoie les messages de -File (tableau JSON) dans « À trier »
param(
  [ValidateSet('check', 'keys', 'insert')][string]$Action = 'check',
  [string]$File,
  [string]$Out = (Join-Path $PSScriptRoot 'out\existing-keys.json')
)
$ErrorActionPreference = 'Stop'

$envFile = Join-Path (Split-Path $PSScriptRoot) '.env'
if (-not (Test-Path $envFile)) { throw "Fichier .env introuvable : $envFile" }
$cfg = @{}
foreach ($line in Get-Content -Encoding UTF8 $envFile) {
  if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*)\s*$') { $cfg[$Matches[1]] = $Matches[2].Trim() }
}
$url = $cfg['SUPABASE_URL']
$key = $cfg['SUPABASE_ANON_KEY']
$token = $cfg['SUPABASE_IMPORT_TOKEN']
if (-not $url -or -not $key) { throw 'SUPABASE_URL ou SUPABASE_ANON_KEY manquant dans .env' }
if (-not $token) { throw 'SUPABASE_IMPORT_TOKEN manquant dans .env' }
$headers = @{ apikey = $key; Authorization = "Bearer $key" }
$rpc = "$url/rest/v1/rpc"

function Write-Utf8([string]$path, [string]$text) {
  $dir = Split-Path $path
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
  [System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
}

function Call-Rpc([string]$name, $payload) {
  $body = [System.Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $payload -Depth 5 -Compress))
  try {
    return Invoke-RestMethod -Method Post -Uri "$rpc/$name" -Headers $headers -Body $body -ContentType 'application/json; charset=utf-8'
  } catch {
    $msg = $_.ErrorDetails.Message
    if (-not $msg) { $msg = $_.Exception.Message }
    throw "Supabase a refusé l'appel $name : $msg"
  }
}

switch ($Action) {
  'check' {
    $keys = @(Call-Rpc 'prioris_import_keys' @{ p_token = $token } | ForEach-Object { $_ } | Where-Object { $_ })
    Write-Output ("Connexion à Supabase : OK. {0} messages déjà importés." -f $keys.Count)
  }
  'keys' {
    $keys = @(Call-Rpc 'prioris_import_keys' @{ p_token = $token } | ForEach-Object { $_ } | Where-Object { $_ })
    Write-Utf8 $Out (ConvertTo-Json -InputObject @($keys))
    Write-Output ("{0} messages déjà importés -> {1}" -f $keys.Count, $Out)
  }
  'insert' {
    if (-not $File -or -not (Test-Path $File)) { throw "Fichier à envoyer introuvable : $File" }
    $allowed = 'source', 'source_key', 'received_on', 'sender', 'subject', 'summary', 'proposed_action',
               'proposed_priority', 'proposed_due', 'draft_reply', 'urgent', 'urgency_reason', 'needs_action'
    $items = @(Get-Content -Raw -Encoding UTF8 $File | ConvertFrom-Json)
    $rows = @(foreach ($it in $items) {
      $row = [ordered]@{}
      foreach ($k in $allowed) {
        $v = $it.$k
        if ($k -in 'received_on', 'proposed_due' -and -not ($v -match '^\d{4}-\d{2}-\d{2}$')) { $v = $null }
        if ($k -eq 'proposed_priority' -and ($v -eq '' -or $v -eq $null)) { $v = $null }
        $row[$k] = $v
      }
      [pscustomobject]$row
    })
    $added = 0
    for ($i = 0; $i -lt $rows.Count; $i += 50) {
      $batch = @($rows[$i..([Math]::Min($i + 49, $rows.Count - 1))])
      $added += [int](Call-Rpc 'prioris_import' @{ p_token = $token; p_items = $batch })
    }
    Write-Output ("{0} messages envoyés, {1} nouveaux ajoutés à Prioris (les autres y étaient déjà)." -f $rows.Count, $added)
  }
}
