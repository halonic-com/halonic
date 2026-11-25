# Installs and activates the Windows licence. The host sends the key on stdin over SSH
# (build-image.sh), so it is never on a command line, in the repo or on the answer ISO.
$ErrorActionPreference = 'Stop'
$windowsAppId = '55c92734-d682-4d71-983e-d6ec3f16059f'

$key = [Console]::In.ReadLine()
if ($null -eq $key) { throw 'no product key on stdin' }
$key = $key.Trim()
if ($key -notmatch '^([A-Z0-9]{5}-){4}[A-Z0-9]{5}$') { throw 'stdin does not hold a product key' }

$service = Get-CimInstance SoftwareLicensingService
Invoke-CimMethod -InputObject $service -MethodName InstallProductKey -Arguments @{ ProductKey = $key } | Out-Null
Invoke-CimMethod -InputObject $service -MethodName RefreshLicenseStatus | Out-Null
$key = $null

$product = Get-CimInstance SoftwareLicensingProduct -Filter "ApplicationID='$windowsAppId' AND PartialProductKey IS NOT NULL"
Invoke-CimMethod -InputObject $product -MethodName Activate | Out-Null
$product = Get-CimInstance SoftwareLicensingProduct -Filter "ApplicationID='$windowsAppId' AND PartialProductKey IS NOT NULL"
# LicenseStatus 1 is "Licensed". Print only the channel and the last five characters.
Write-Output "licence: $($product.Name), channel $($product.ProductKeyChannel), key ...$($product.PartialProductKey), status $($product.LicenseStatus)"
if ($product.LicenseStatus -ne 1) { throw "Windows is not activated (LicenseStatus $($product.LicenseStatus))" }
