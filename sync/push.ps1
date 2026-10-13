# Échanges avec Supabase pour la synchronisation, avec la clé secrète du fichier .env local.
# La clé n'est jamais affichée.
#   -Action check   : vérifie la connexion
#   -Action keys    : écrit la liste des messages déjà importés (source_key) dans -Out
#   -Action insert  : envoie les messages de -File (tableau JSON) dans la table inbox_items
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
$key = $cfg['SUPABASE_SECRET_KEY']
if (-not $url) { throw 'SUPABASE_URL manquant dans .env' }
if (-not $key) { throw 'SUPABASE_SECRET_KEY manquant dans .env : colle la clé secrète Supabase (Settings > API Keys > Secret keys).' }
$headers = @{ apikey = $key; Authorization = "Bearer $key" }
$base = "$url/rest/v1"

function Write-Utf8([string]$path, [string]$text) {
  $dir = Split-Path $path
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
  [System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
}

switch ($Action) {
  'check' {
    $r = Invoke-RestMethod -Method Get -Uri "$base/inbox_items?select=id&limit=1" -Headers $headers
    Write-Output 'Connexion à Supabase : OK (table inbox_items accessible).'
  }
  'keys' {
    $all = @()
    $offset = 0
    do {
      $page = Invoke-RestMethod -Method Get -Uri "$base/inbox_items?select=source_key&order=id&limit=1000&offset=$offset" -Headers $headers
      $page = @($page)
      $all += $page | ForEach-Object { $_.source_key }
      $offset += 1000
    } while ($page.Count -eq 1000)
    Write-Utf8 $Out (ConvertTo-Json -InputObject @($all))
    Write-Output ("{0} messages déjà importés -> {1}" -f $all.Count, $Out)
  }
  'insert' {
    if (-not $File -or -not (Test-Path $File)) { throw "Fichier à envoyer introuvable : $File" }
    $allowed = 'source', 'source_key', 'received_on', 'sender', 'subject', 'summary', 'proposed_action',
               'proposed_priority', 'proposed_due', 'draft_reply', 'urgent', 'urgency_reason', 'needs_action'
    $items = @(Get-Content -Raw -Encoding UTF8 $File | ConvertFrom-Json)
    $rows = foreach ($it in $items) {
      $row = [ordered]@{}
      foreach ($k in $allowed) {
        $v = $it.$k
        if ($k -in 'received_on', 'proposed_due' -and -not $v) { $v = $null }
        if ($k -eq 'proposed_priority' -and ($v -eq '' -or $v -eq $null)) { $v = $null }
        $row[$k] = $v
      }
      [pscustomobject]$row
    }
    $sent = 0
    for ($i = 0; $i -lt $rows.Count; $i += 50) {
      $batch = @($rows[$i..([Math]::Min($i + 49, $rows.Count - 1))])
      $body = [System.Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $batch -Depth 3))
      $h = $headers.Clone()
      $h['Prefer'] = 'resolution=ignore-duplicates,return=minimal'
      Invoke-RestMethod -Method Post -Uri "$base/inbox_items?on_conflict=source_key" -Headers $h -Body $body -ContentType 'application/json; charset=utf-8' | Out-Null
      $sent += $batch.Count
    }
    Write-Output ("{0} messages envoyés à Prioris." -f $sent)
  }
}
