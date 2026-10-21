# EXCEPTION à la règle « ne jamais modifier les classeurs » : à ne lancer que sur demande explicite d'Alex,
# après une sauvegarde du classeur (voir NETTOYAGE.md, étape 6). Essayé d'abord sur une copie.
# Retire des lignes de l'onglet « Synthèse emails » : supprime celles du plan marquées « supprimer » et
# déplace vers « Traités » (comme la macro du classeur : copie à la suite, puis suppression) celles
# marquées « deplacer ». Chaque ligne est vérifiée (date + expéditeur) AVANT toute modification ; au
# moindre écart, rien n'est touché.
param(
  [Parameter(Mandatory = $true)][string]$Classeur,
  [Parameter(Mandatory = $true)][string]$Plan,
  [switch]$Appliquer          # sans lui : vérification seule, le classeur n'est pas enregistré
)
$ErrorActionPreference = 'Stop'
$lignes = @(ConvertFrom-Json -InputObject (Get-Content -Raw -Encoding UTF8 $Plan) | ForEach-Object { $_ })
$xl = New-Object -ComObject Excel.Application
$wb = $null
try {
  $xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.EnableEvents = $false
  $xl.AutomationSecurity = 3                      # macros désactivées à l'ouverture
  $wb = $xl.Workbooks.Open($Classeur, 0, (-not $Appliquer))
  $ws = $wb.Worksheets.Item('Synthèse emails')
  $tr = $wb.Worksheets.Item('Traités')

  # 1. Vérification de toutes les lignes avant modification
  $ecarts = @()
  foreach ($p in $lignes) {
    $v = $ws.Cells.Item([int]$p.ligne, 1).Value2
    if ($v -is [double]) { $date = [DateTime]::FromOADate($v).ToString('yyyy-MM-dd') }
    else {
      $d = [DateTime]::MinValue
      $ok = [DateTime]::TryParseExact(([string]$v).Trim(), [string[]]@('dd/MM/yyyy', 'dd/MM/yyyy HH:mm', 'yyyy-MM-dd'), [Globalization.CultureInfo]::GetCultureInfo('fr-FR'), [Globalization.DateTimeStyles]::None, [ref]$d)
      $date = if ($ok) { $d.ToString('yyyy-MM-dd') } else { [string]$v }
    }
    $sender = [string]$ws.Cells.Item([int]$p.ligne, 2).Value2
    $statut = [string]$ws.Cells.Item([int]$p.ligne, 5).Value2
    if ($date -ne $p.date -or $sender.Trim() -ne ([string]$p.sender).Trim()) { $ecarts += "ligne $($p.ligne) : attendu $($p.date) / $($p.sender), trouvé $date / $sender" }
    elseif ($p.action -eq 'deplacer' -and $statut.Trim() -ne 'Traité') { $ecarts += "ligne $($p.ligne) : statut « $statut » au lieu de « Traité »" }
  }
  if ($ecarts.Count) { $ecarts | ForEach-Object { Write-Output "ÉCART $_" }; throw "$($ecarts.Count) ligne(s) ne correspondent plus au plan : rien n'a été modifié. Refaire l'extraction." }
  Write-Output ("Vérification : {0} lignes conformes ({1} à supprimer, {2} à déplacer)." -f $lignes.Count, @($lignes | Where-Object action -eq 'supprimer').Count, @($lignes | Where-Object action -eq 'deplacer').Count)
  if (-not $Appliquer) { Write-Output 'Vérification seule : classeur non modifié.'; return }

  $avantSyn = $ws.ListObjects.Item(1).ListRows.Count
  $avantTr = $tr.Cells.Item($tr.Rows.Count, 1).End(-4162).Row

  # 2. Déplacement vers « Traités » (dans l'ordre du classeur), comme la macro
  foreach ($p in ($lignes | Where-Object action -eq 'deplacer' | Sort-Object { [int]$_.ligne })) {
    $dest = $tr.Cells.Item($tr.Rows.Count, 1).End(-4162).Row + 1
    if ($dest -lt 3) { $dest = 3 }
    [void]$ws.Rows.Item([int]$p.ligne).Copy($tr.Rows.Item($dest))
  }
  # 3. Suppression, du bas vers le haut pour ne pas décaler les lignes restantes
  foreach ($p in ($lignes | Sort-Object { [int]$_.ligne } -Descending)) { [void]$ws.Rows.Item([int]$p.ligne).Delete() }

  $apresSyn = $ws.ListObjects.Item(1).ListRows.Count
  $apresTr = $tr.Cells.Item($tr.Rows.Count, 1).End(-4162).Row
  Write-Output ("Synthèse emails : {0} -> {1} lignes ({2}) ; Traités : dernière ligne {3} -> {4} (+{5})" -f $avantSyn, $apresSyn, ($apresSyn - $avantSyn), $avantTr, $apresTr, ($apresTr - $avantTr))
  $wb.Save()
  Write-Output 'Classeur enregistré.'
} catch {
  Write-Output ("ERREUR ligne {0} du script : {1}" -f $_.InvocationInfo.ScriptLineNumber, $_.Exception.Message)
  exit 1
} finally {
  if ($wb) { $wb.Close($false) }
  $xl.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
}
