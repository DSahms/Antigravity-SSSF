<#
Powershell script to test launching CREW Software
#>

$appPath = "C:\CREW Software\CREW Software.exe"
$resourcesPath = "C:\CREW Software\resources"

# Set environment variables for the application
$env:Path = "$resourcesPath;$env:Path"

# Start the application
Start-Process -FilePath $appPath -NoNewWindow -PassThru | Out-Null
