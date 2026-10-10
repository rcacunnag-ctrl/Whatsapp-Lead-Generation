# Sube un entregable (dashboard HTML de Tier 1; .docx/.pdf de Tier 2) al monitor para enlazarlo en el panel.
# El original sigue en OneDrive; en el servidor queda solo esta copia para verlo. Máximo 40 MB por archivo.
# Uso: pwsh scripts\subir-informe.ps1 -LeadId <id del lead> -Tier 1 -Archivo "C:\...\Informes Tier 1\x-comp-dashboard.html"
param(
  [Parameter(Mandatory)][string]$LeadId,
  [ValidateSet('1', '2')][string]$Tier = '1',
  [Parameter(Mandatory)][string]$Archivo,
  [string]$Api = 'http://100.97.63.81:3000'
)
$ErrorActionPreference = 'Stop'
$item = Get-Item -LiteralPath $Archivo
$uri = '{0}/api/leads/{1}/informes?tier={2}&nombre={3}' -f $Api, $LeadId, $Tier, [uri]::EscapeDataString($item.Name)
Invoke-RestMethod -Method Post -Uri $uri -Headers @{ 'X-Monitor' = '1' } -ContentType 'application/octet-stream' `
  -InFile $item.FullName -TimeoutSec 300
