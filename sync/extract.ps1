# Lit les deux classeurs (copie temporaire, lecture seule) et écrit les messages à traiter en JSON.
# Mails  : « Traitement des mails 2026.xlsm », onglet « Synthèse emails » (en-tête ligne 2)
# WhatsApp : « Suivi WhatsApp.xlsm », onglet « À traiter » (en-tête ligne 1)
#
# Clés des mails : le classeur ne contient aucun identifiant de message, et la colonne C change
# (la compétence « synthese » remplace le mail brut par un résumé). La clé d'un mail est donc
# figée à sa première importation, puis retrouvée à chaque lecture en comparant le classeur à
# la liste des messages déjà dans Prioris (date + expéditeur + nombre de lignes). Voir SYNC.md.
#   -Index      : fichier JSON de cette liste (push.ps1 -Action index). Sans lui, le script la
#                 demande lui-même à Supabase.
#   -SansIndex  : ancien comportement (clé recalculée depuis le contenu actuel de la colonne C).
#                 À éviter : un mail résumé depuis son import réapparaît comme nouveau.
param(
  [string]$Out = (Join-Path $PSScriptRoot 'out\messages.json'),
  [string]$Folder = (Join-Path $env:USERPROFILE 'OneDrive - CAMP SPA\Gestion des messageries'),
  [string]$Index,
  [switch]$SansIndex
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.Web

function Read-Sheet([string]$Path, [string]$SheetName) {
  $tmp = Join-Path $env:TEMP ('prioris-' + [guid]::NewGuid().ToString() + '.zip')
  Copy-Item -LiteralPath $Path -Destination $tmp -Force
  $zip = [System.IO.Compression.ZipFile]::OpenRead($tmp)
  try {
    $read = {
      param($name)
      $e = $zip.Entries | Where-Object { $_.FullName -eq $name }
      if (-not $e) { return $null }
      $r = New-Object System.IO.StreamReader($e.Open()); $t = $r.ReadToEnd(); $r.Close(); $t
    }
    [xml]$wb = & $read 'xl/workbook.xml'
    [xml]$rels = & $read 'xl/_rels/workbook.xml.rels'
    $strings = @()
    $ssXml = & $read 'xl/sharedStrings.xml'
    if ($ssXml) { [xml]$ss = $ssXml; foreach ($si in $ss.sst.si) { $strings += $si.InnerText } }
    $sheet = $wb.workbook.sheets.sheet | Where-Object { $_.name -eq $SheetName }
    if (-not $sheet) { throw "Onglet introuvable : $SheetName" }
    $rid = $sheet.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    $target = ($rels.Relationships.Relationship | Where-Object { $_.Id -eq $rid }).Target
    [xml]$sx = & $read ('xl/' + ($target -replace '^/xl/', ''))
    $rows = @()
    foreach ($row in $sx.worksheet.sheetData.row) {
      $cells = @{}
      foreach ($c in $row.c) {
        $col = $c.r -replace '\d', ''
        if ($c.t -eq 's') { $v = $strings[[int]$c.v] }
        elseif ($c.t -eq 'inlineStr') { $v = $c.is.InnerText }
        else { $v = [string]$c.v }
        $cells[$col] = $v
      }
      $rows += [pscustomobject]@{ Row = [int]$row.r; Cells = $cells }
    }
    return $rows
  } finally {
    $zip.Dispose()
    Remove-Item -LiteralPath $tmp -Force
  }
}

function To-IsoDate($v) {
  if (-not $v) { return $null }
  $d = 0.0
  if ([double]::TryParse([string]$v, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$d)) {
    return [DateTime]::FromOADate($d).ToString('yyyy-MM-dd')
  }
  $p = [DateTime]::MinValue
  $formats = [string[]]@('dd/MM/yyyy', 'dd/MM/yyyy HH:mm', 'yyyy-MM-dd')
  if ([DateTime]::TryParseExact(([string]$v).Trim(), $formats, [System.Globalization.CultureInfo]::GetCultureInfo('fr-FR'), [System.Globalization.DateTimeStyles]::None, [ref]$p)) {
    return $p.ToString('yyyy-MM-dd')
  }
  return [string]$v
}

function Clean-Text([string]$s, [int]$max) {
  if (-not $s) { return '' }
  $s = [regex]::Replace($s, '(?is)<(style|script|head)[^>]*>.*?</\1>', ' ')
  $s = [regex]::Replace($s, '(?s)<[^>]+>', ' ')
  $s = [System.Web.HttpUtility]::HtmlDecode($s)
  $s = [regex]::Replace($s, '\s+', ' ').Trim()
  if ($s.Length -gt $max) { $s = $s.Substring(0, $max) + '…' }
  return $s
}

function Key([string]$text) {
  $sha = [System.Security.Cryptography.SHA1]::Create()
  $bytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($text.ToLowerInvariant()))
  return ([BitConverter]::ToString($bytes) -replace '-', '').Substring(0, 20)
}

# Jour (AAAA-MM-JJ) d'une date lue dans Excel ou renvoyée par Supabase ; vide si illisible
# (c'est aussi ce que Prioris enregistre quand la date du classeur n'est pas lisible).
function Get-Day($v) {
  if ($v -is [datetime]) { return $v.ToString('yyyy-MM-dd') }
  if ([string]$v -match '^(\d{4}-\d{2}-\d{2})') { return $Matches[1] }
  return ''
}

function Get-GroupId($day, [string]$sender) {
  return (Get-Day $day) + '|' + $sender.Trim().ToLowerInvariant()
}

# Liste des messages déjà dans Prioris (id, source_key, source, received_on, sender), ou $null
function Get-DbIndex {
  if ($SansIndex) { return $null }
  $path = $Index
  if (-not $path) {
    $path = Join-Path $PSScriptRoot 'out\existing-index.json'
    try {
      & (Join-Path $PSScriptRoot 'push.ps1') -Action index -Out $path | Out-Host
    } catch {
      throw ("Impossible de lire la liste des messages déjà importés : $($_.Exception.Message)`n" +
             "Si la fonction prioris_import_index n'existe pas encore, exécuter d'abord sql/2026-10-cles-stables.sql " +
             "dans Supabase (SQL Editor). Pour passer outre, relancer avec -SansIndex (les mails résumés réapparaîtront).")
    }
  }
  if (-not (Test-Path $path)) { throw "Fichier d'index introuvable : $path" }
  $parsed = ConvertFrom-Json -InputObject (Get-Content -Raw -Encoding UTF8 $path)
  return @($parsed | ForEach-Object { $_ })
}

# Retrouve, pour chaque mail du classeur, la clé sous laquelle il est déjà dans Prioris.
# Un mail de la même date et du même expéditeur est déjà connu quand :
#   1. sa clé recalculée existe dans Prioris (« exacte ») ;
#   2. sinon, il a été résumé depuis son import : il prend la clé d'un message de Prioris du même
#      jour et du même expéditeur qu'aucune autre ligne ne revendique (« rapprochee »).
# Un mail encore brut (HTML) dont la clé est inconnue est forcément nouveau : son contenu n'a pas
# changé depuis l'import, il aurait été reconnu à l'étape 1. Les autres sont « nouvelle ».
function Resolve-MailKeys($mails, $dbEntries) {
  $byKey = @{}
  $byGroup = @{}
  foreach ($e in $dbEntries) {
    if ($e.source -ne 'mail') { continue }
    $byKey[[string]$e.source_key] = $e
    $g = Get-GroupId $e.received_on ([string]$e.sender)
    if (-not $byGroup.ContainsKey($g)) { $byGroup[$g] = New-Object System.Collections.ArrayList }
    [void]$byGroup[$g].Add($e)
  }
  $used = @{}
  foreach ($m in $mails) {
    if ($byKey.ContainsKey($m.source_key)) { $m.key_match = 'exacte'; $used[$m.source_key] = $true }
  }
  foreach ($m in $mails) {
    if ($m.key_match) { continue }
    $m.key_match = 'nouvelle'
    if ($m.brut -or -not $byGroup.ContainsKey($m.groupe)) { continue }
    $libre = $byGroup[$m.groupe] | Where-Object { -not $used.ContainsKey([string]$_.source_key) } | Select-Object -First 1
    if ($libre) {
      $m.source_key = [string]$libre.source_key
      $m.key_match = 'rapprochee'
      $used[$m.source_key] = $true
    }
  }
}

$items = @()

# --- Mails ---
$mailRows = Read-Sheet (Join-Path $Folder 'Traitement des mails 2026.xlsm') 'Synthèse emails'
$mailItems = @()
foreach ($r in $mailRows) {
  if ($r.Row -le 2) { continue }
  $sender = [string]$r.Cells['B']
  $raw = [string]$r.Cells['C']
  if (-not $sender -and -not $raw) { continue }
  $isHtml = $raw -match '<html'
  if ($isHtml) {
    $subject = Clean-Text ($raw.Substring(0, $raw.IndexOf('<html'))) 200
    $content = Clean-Text ($raw.Substring($raw.IndexOf('<html'))) 1500
  } else {
    $subject = ''
    $content = Clean-Text $raw 1500
  }
  $date = To-IsoDate $r.Cells['A']
  $basis = if ($subject) { $subject } else { $content.Substring(0, [Math]::Min(60, $content.Length)) }
  $mailItems += [pscustomobject]@{
    source = 'mail'
    source_key = 'mail-' + (Key "$date|$sender|$basis")   # clé d'un NOUVEAU mail ; remplacée plus bas pour un mail déjà connu
    key_match = $null
    received_on = $date
    sender = $sender
    subject = $subject
    content = $content
    excel_action = [string]$r.Cells['D']
    excel_status = [string]$r.Cells['E']
    excel_reply = [string]$r.Cells['F']
    excel_priority = ''
    excel_row = $r.Row
    groupe = Get-GroupId $date $sender
    brut = [bool]$isHtml
  }
}

$dbEntries = Get-DbIndex
if ($null -ne $dbEntries) {
  Resolve-MailKeys $mailItems $dbEntries
} else {
  foreach ($m in $mailItems) { $m.key_match = 'sans-index' }
}
$items += $mailItems | Select-Object -Property * -ExcludeProperty groupe, brut

# --- WhatsApp ---
$waRows = Read-Sheet (Join-Path $Folder 'Suivi WhatsApp.xlsm') 'À traiter'
foreach ($r in $waRows) {
  if ($r.Row -le 1) { continue }
  $sender = [string]$r.Cells['B']
  $text = [string]$r.Cells['C']
  if (-not $sender -and -not $text) { continue }
  $date = To-IsoDate $r.Cells['A']
  $items += [pscustomobject]@{
    source = 'whatsapp'
    source_key = 'wa-' + (Key "$date|$sender")
    received_on = $date
    sender = $sender
    subject = ''
    content = Clean-Text $text 1500
    excel_action = [string]$r.Cells['E']
    excel_status = [string]$r.Cells['F']
    excel_reply = ''
    excel_priority = [string]$r.Cells['D']
    excel_row = $r.Row
  }
}

$dir = Split-Path $Out
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
$json = ConvertTo-Json -InputObject @($items) -Depth 3
[System.IO.File]::WriteAllText($Out, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Output ("{0} messages lus ({1} mails, {2} WhatsApp) -> {3}" -f $items.Count, @($items | Where-Object source -eq 'mail').Count, @($items | Where-Object source -eq 'whatsapp').Count, $Out)
foreach ($g in ($mailItems | Group-Object key_match | Sort-Object Name)) {
  Write-Output ("  mails « {0} » : {1}" -f $g.Name, $g.Count)
}
