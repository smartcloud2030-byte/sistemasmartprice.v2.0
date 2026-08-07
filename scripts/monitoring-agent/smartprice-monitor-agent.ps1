# ─────────────────────────────────────────
# smartprice-monitor-agent.ps1
# Le smartprice-monitor.json (mesma pasta), coleta CPU/RAM/disco e envia pro
# SmartPrice. Agendar no Agendador de Tarefas do Windows pra rodar a cada 1
# minuto. Nao precisa de nada instalado alem do PowerShell (nativo do Windows).
# ─────────────────────────────────────────

$configPath = Join-Path $PSScriptRoot 'smartprice-monitor.json'
if (-not (Test-Path $configPath)) {
  Write-Output "Arquivo de configuracao nao encontrado: $configPath"
  exit 1
}

try {
  $config = Get-Content $configPath -Raw | ConvertFrom-Json

  $cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
  $os = Get-CimInstance Win32_OperatingSystem
  $memPercent = [math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100, 1)
  $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
  $diskPercent = [math]::Round((($disk.Size - $disk.FreeSpace) / $disk.Size) * 100, 1)

  $body = @{
    machineName = $config.machineName
    role        = $config.role
    cpuPercent  = $cpu
    memPercent  = $memPercent
    diskPercent = $diskPercent
  } | ConvertTo-Json

  Invoke-RestMethod -Uri 'https://sistemasmartprice.com.br/api/monitoring/report' `
    -Method Post `
    -Headers @{ 'x-monitoring-token' = $config.monitoringToken } `
    -ContentType 'application/json' `
    -Body $body `
    -TimeoutSec 15 | Out-Null
} catch {
  # Falha de rede/servidor nao deve travar a tarefa agendada nem gerar popup.
  Write-Output "Falha ao enviar metricas: $($_.Exception.Message)"
}
