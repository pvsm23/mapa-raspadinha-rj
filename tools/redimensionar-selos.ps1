# Reduz o peso dos selos (assets/img/selos): qualquer PNG com lado
# maior que 1024px é redimensionado pra 1024 (mesma resolução já usada
# nos selos "normais", que sempre pesaram bem menos) -- mantém PNG
# (não JPEG) porque parte dos selos dourados tem transparência de
# verdade e parte não, então trocar de formato pra todos correria o
# risco de quebrar a transparência de alguns. Roda uma vez (script de
# manutenção, não faz parte do app em produção).
Add-Type -AssemblyName System.Drawing

$dir = Join-Path $PSScriptRoot "..\assets\img\selos"
$maxLado = 1024
$arquivos = Get-ChildItem $dir -Filter "*.png"

$totalAntes = 0
$totalDepois = 0

foreach ($f in $arquivos) {
    $tamanhoAntes = $f.Length
    $totalAntes += $tamanhoAntes

    $img = [System.Drawing.Image]::FromFile($f.FullName)
    $w = $img.Width
    $h = $img.Height

    if ($w -le $maxLado -and $h -le $maxLado) {
        $img.Dispose()
        $totalDepois += $tamanhoAntes
        Write-Output "$($f.Name): ja em $($w)x$($h), sem mudanca"
        continue
    }

    $escala = $maxLado / [Math]::Max($w, $h)
    $novoW = [int][Math]::Round($w * $escala)
    $novoH = [int][Math]::Round($h * $escala)

    $bmp = New-Object System.Drawing.Bitmap($novoW, $novoH)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($img, 0, 0, $novoW, $novoH)
    $g.Dispose()
    $img.Dispose()

    $temp = "$($f.FullName).tmp"
    $bmp.Save($temp, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Move-Item -Force $temp $f.FullName

    $tamanhoDepois = (Get-Item $f.FullName).Length
    $totalDepois += $tamanhoDepois

    Write-Output "$($f.Name): $($w)x$($h) -> $($novoW)x$($novoH), $([Math]::Round($tamanhoAntes/1MB,2))MB -> $([Math]::Round($tamanhoDepois/1MB,2))MB"
}

Write-Output "---"
Write-Output "TOTAL: $([Math]::Round($totalAntes/1MB,1))MB -> $([Math]::Round($totalDepois/1MB,1))MB"
