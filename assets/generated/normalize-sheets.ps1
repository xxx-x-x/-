Add-Type -AssemblyName System.Drawing
$assetRoot = $PSScriptRoot
$originals = Join-Path $assetRoot 'originals'
[IO.Directory]::CreateDirectory($originals) | Out-Null
$encoded = Join-Path $assetRoot 'bullet-impact.png.b64'
if (Test-Path -LiteralPath $encoded) {
    [IO.File]::WriteAllBytes((Join-Path $assetRoot 'bullet-impact.png'), [Convert]::FromBase64String([IO.File]::ReadAllText($encoded)))
    Remove-Item -LiteralPath $encoded
}
$names = @('enemy-rifle-walk.png', 'muzzle-flash.png', 'explosion.png', 'smoke.png', 'bullet-impact.png')
foreach ($name in $names) {
    $sourcePath = Join-Path $originals $name
    if (!(Test-Path -LiteralPath $sourcePath)) {
        Move-Item -LiteralPath (Join-Path $assetRoot $name) -Destination $sourcePath
    }
    $source = [Drawing.Bitmap]::new($sourcePath)
    $output = [Drawing.Bitmap]::new(1024, 1024, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [Drawing.Graphics]::FromImage($output)
    $graphics.Clear([Drawing.Color]::Transparent)
    $graphics.CompositingMode = [Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $rows = if ($name -eq 'enemy-rifle-walk.png') { 2 } else { 4 }
    $cellWidth = 256
    $cellHeight = 1024 / $rows
    for ($row = 0; $row -lt $rows; $row++) {
        for ($col = 0; $col -lt 4; $col++) {
            $src = [Drawing.RectangleF]::new($col * $source.Width / 4, $row * $source.Height / $rows, $source.Width / 4, $source.Height / $rows)
            $dst = [Drawing.RectangleF]::new($col * $cellWidth + 16, $row * $cellHeight + 16, $cellWidth - 32, $cellHeight - 32)
            $graphics.DrawImage($source, $dst, $src, [Drawing.GraphicsUnit]::Pixel)
        }
    }
    $graphics.Dispose()
    $output.Save((Join-Path $assetRoot $name), [Drawing.Imaging.ImageFormat]::Png)
    $output.Dispose()
    $source.Dispose()
}
Get-ChildItem -LiteralPath $assetRoot -Filter '*.png' | ForEach-Object {
    $bitmap = [Drawing.Bitmap]::new($_.FullName)
    [PSCustomObject]@{ File = $_.Name; Width = $bitmap.Width; Height = $bitmap.Height; Format = $bitmap.PixelFormat.ToString(); CornerAlpha = $bitmap.GetPixel(0, 0).A }
    $bitmap.Dispose()
}
