# Compare les messages de Prioris à la boîte Outlook lue dans le navigateur (voir NETTOYAGE.md).
# Entrée : -Outlook, fichier JSON de lignes [date AAAA-MM-JJ, nom affiché, objet] (sync/lire-outlook.js).
# Sortie : -Out, les candidats à la suppression (messages de Prioris sans correspondance dans la boîte),
# classés en groupes, et -OutA, les clés du groupe A seul (prêtes pour push.ps1 -Action delete-keys).
#   A = robots, newsletters, publicités, reçus : sûrs à supprimer après accord d'Alex
#   B = demande possible (lots, sponsoring, devis, stand…) : à vérifier un par un
#   C = personnes et collègues : à relire
# Rien n'est modifié ni dans Outlook ni dans Prioris : ce script ne fait que comparer.
param(
  [Parameter(Mandatory = $true)][string]$Outlook,
  [string]$Messages,
  [string]$Since = '2026-09-17',
  [string]$Out,
  [string]$OutA
)
$ErrorActionPreference = 'Stop'
# (calculés ici : $PSScriptRoot est vide dans les valeurs par défaut quand un paramètre est obligatoire)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Messages) { $Messages = Join-Path $root 'out\messages.json' }
if (-not $Out) { $Out = Join-Path $root 'out\candidats.json' }
if (-not $OutA) { $OutA = Join-Path $root 'out\delete-keys-A.json' }

function Norm([string]$t) {
  $d = $t.Normalize([Text.NormalizationForm]::FormD)
  (($d.ToCharArray() | Where-Object { [Globalization.CharUnicodeInfo]::GetUnicodeCategory($_) -ne 'NonSpacingMark' }) -join '').ToLowerInvariant()
}
$stop = 'contact', 'commande', 'alexandre', 'camp', 'demande', 'partenariat', 'proposition', 'bonjour', 'message', 'votre', 'pour', 'avec', 'dans', 'nous', 'vous', 'recu', 'envoi'
function Tokens([string]$t, [int]$min) {
  @((Norm $t) -split '[^a-z0-9]+' | Where-Object { $_.Length -ge $min -and $_ -notin $stop } | Select-Object -Unique)
}

$raw = ConvertFrom-Json -InputObject (Get-Content -Raw -Encoding UTF8 $Outlook)
$ol = @(foreach ($row in $raw) { [pscustomobject]@{ date = [string]$row[0]; nom = [string]$row[1]; sujet = [string]$row[2] } })
if ($ol.Count -lt 20) { throw "Seulement $($ol.Count) conversations lues : lecture de la boîte probablement incomplète, comparaison abandonnée." }
$olTokens = @($ol | ForEach-Object { [pscustomobject]@{ o = $_; nom = (Tokens $_.nom 4); sujet = (Tokens $_.sujet 5); nomNorm = (Norm $_.nom) } })

# Trouve la raison pour laquelle un message de Prioris existe encore dans la boîte, ou $null
function Raison($e) {
  $sender = Norm $e.sender
  $hay = Norm ($e.sender + ' ' + $e.content)
  foreach ($x in $olTokens) {
    if ($x.o.nom -match '@' -and $sender -eq $x.nomNorm) { return 'adresse' }
    if ($x.o.nom -in 'Contact', 'Commande') { if ($sender -like ('*' + $x.nomNorm + '@*')) { return 'boite partagee' } }
    elseif ($x.nom.Count -and @($x.nom | Where-Object { $hay.Contains($_) }).Count -ge 1) { return 'nom' }
    if ($x.sujet.Count -ge 2 -and @($x.sujet | Where-Object { $hay.Contains($_) }).Count -ge 2) { return 'objet' }
  }
  return $null
}

$patA = 'no-?reply|newsletter|news@|news0|marketing@|info@|postmaster|notification|mailer|mailing|activemailer|dropbox|justificatif-de-paiement@monext|receipts-.*bolt|satisfaction@kiloutou|cciformation|crealpimo|rectoverso|linktr\.ee|rockypop|destinationsnature|expemag|montagneleaders|mountainplanet|espace-client@.*preventica|rxglobal|sumup'
$patB = 'lots?\b|sponsor|dotation|partenariat|devis|stand|visuel|bannière|logo|demande'

$mails = @(Get-Content -Raw -Encoding UTF8 $Messages | ConvertFrom-Json | ForEach-Object { $_ } |
  Where-Object { $_.source -eq 'mail' -and $_.received_on -ge $Since -and $_.excel_status -ne 'Traité' -and $_.key_match -in 'exacte', 'rapprochee' })
$cand = @(foreach ($e in $mails) {
  if (Raison $e) { continue }
  $groupe = if ($e.sender -match $patA) { 'A' } elseif ($e.content -match $patB) { 'B' } else { 'C' }
  [pscustomobject]@{ groupe = $groupe; source_key = $e.source_key; received_on = $e.received_on; sender = $e.sender; excel_row = $e.excel_row; resume = $e.content.Substring(0, [Math]::Min(80, $e.content.Length)) }
})

$dir = Split-Path $Out
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
[System.IO.File]::WriteAllText($Out, (ConvertTo-Json -InputObject @($cand) -Depth 3), (New-Object System.Text.UTF8Encoding($false)))
$keysA = @($cand | Where-Object groupe -eq 'A' | ForEach-Object { $_.source_key } | Select-Object -Unique)
[System.IO.File]::WriteAllText($OutA, (ConvertTo-Json -InputObject @($keysA)), (New-Object System.Text.UTF8Encoding($false)))

Write-Output ("{0} conversations Outlook ; {1} messages de Prioris examinés (depuis {2}) ; {3} introuvables dans la boîte." -f $ol.Count, $mails.Count, $Since, $cand.Count)
foreach ($g in 'A', 'B', 'C') { Write-Output ("  groupe {0} : {1}" -f $g, @($cand | Where-Object groupe -eq $g).Count) }
Write-Output "Candidats -> $Out"
Write-Output ("Clés du groupe A ({0}) -> {1}" -f $keysA.Count, $OutA)
