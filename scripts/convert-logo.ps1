# PowerShell script to convert JPG to PNG using .NET
Add-Type -AssemblyName System.Drawing

$sourcePath = Join-Path $PSScriptRoot "../public/logo-new.jpg"
$destPath = Join-Path $PSScriptRoot "../public/logo.png"

try {
    # Load the image
    $image = [System.Drawing.Image]::FromFile($sourcePath)
    
    # Create a new bitmap with the same dimensions
    $bitmap = New-Object System.Drawing.Bitmap($image.Width, $image.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.DrawImage($image, 0, 0, $image.Width, $image.Height)
    
    # Save as PNG
    $bitmap.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    # Also create icon sizes
    $iconSizes = @(32, 32, 180) # 32x32 for icons, 180x180 for apple-icon
    
    # icon-light-32x32.png
    $icon32 = New-Object System.Drawing.Bitmap(32, 32)
    $icon32Graphics = [System.Drawing.Graphics]::FromImage($icon32)
    $icon32Graphics.DrawImage($image, 0, 0, 32, 32)
    $icon32Path = Join-Path $PSScriptRoot "../public/icon-light-32x32.png"
    $icon32.Save($icon32Path, [System.Drawing.Imaging.ImageFormat]::Png)
    
    # icon-dark-32x32.png (same for now)
    $icon32DarkPath = Join-Path $PSScriptRoot "../public/icon-dark-32x32.png"
    $icon32.Save($icon32DarkPath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    # apple-icon.png (180x180)
    $appleIcon = New-Object System.Drawing.Bitmap(180, 180)
    $appleGraphics = [System.Drawing.Graphics]::FromImage($appleIcon)
    $appleGraphics.DrawImage($image, 0, 0, 180, 180)
    $appleIconPath = Join-Path $PSScriptRoot "../public/apple-icon.png"
    $appleIcon.Save($appleIconPath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    # Cleanup
    $graphics.Dispose()
    $bitmap.Dispose()
    $icon32Graphics.Dispose()
    $icon32.Dispose()
    $appleGraphics.Dispose()
    $appleIcon.Dispose()
    $image.Dispose()
    
    Write-Host "✅ Logo converted and all icon files created successfully!" -ForegroundColor Green
} catch {
    Write-Host "❌ Error converting logo: $_" -ForegroundColor Red
    exit 1
}

