# Lit les deux classeurs (copie temporaire, lecture seule) et écrit les messages à traiter en JSON.
# Mails  : « Traitement des mails 2026.xlsm », onglet « Synthèse emails » (en-tête ligne 2)
# WhatsApp : « Suivi WhatsApp.xlsm », onglet « À traiter » (en-tête ligne 1)
param(
  [string]$Out = (Join-Path $PSScriptRoot 'out\messages.json'),
  [string]$Folder = (Join-Path $env:USERPROFILE 'OneDrive - CAMP SPA\Gestion des messageries')
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

$items = @()

# --- Mails ---
$mailRows = Read-Sheet (Join-Path $Folder 'Traitement des mails 2026.xlsm') 'Synthèse emails'
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
  $items += [pscustomobject]@{
    source = 'mail'
    source_key = 'mail-' + (Key "$date|$sender|$basis")
    received_on = $date
    sender = $sender
    subject = $subject
    content = $content
    excel_action = [string]$r.Cells['D']
    excel_status = [string]$r.Cells['E']
    excel_reply = [string]$r.Cells['F']
    excel_priority = ''
    excel_row = $r.Row
  }
}

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
