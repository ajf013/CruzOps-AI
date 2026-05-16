# PowerShell Runbook: Check-AppExpiry
# Purpose: Notify owners of App Registrations when secrets are set to expire.

$NotificationThresholds = @(30, 15, 7, 1)
$RecipientEmails = @("Anto13franc@outlook.com", "sasafiyullah@outlook.com")

try {
    Write-Output "🔐 Connecting to Azure with Managed Identity..."
    Connect-AzAccount -Identity
} catch {
    Write-Error "❌ Failed to connect with Managed Identity. Ensure it is enabled and assigned permissions."
    return
}

# Get Graph Token
Write-Output "🎫 Fetching Graph API Token..."
$AccessToken = (Get-AzAccessToken -ResourceUrl "https://graph.microsoft.com").Token
$Headers = @{
    "Authorization" = "Bearer $AccessToken"
    "Content-Type"  = "application/json"
}

# Fetch Applications
Write-Output "🔍 Scanning App Registrations..."
$AppsUrl = "https://graph.microsoft.com/v1.0/applications"
$AppsResponse = Invoke-RestMethod -Uri $AppsUrl -Headers $Headers -Method Get
$Apps = $AppsResponse.value

$Now = Get-Date

foreach ($App in $Apps) {
    $DisplayName = $App.displayName
    $AppId = $App.appId
    $Creds = $App.passwordCredentials

    foreach ($Cred in $Creds) {
        $ExpiryDate = [DateTime]::Parse($Cred.endDateTime)
        $TimeSpan = $ExpiryDate - $Now
        $DaysRemaining = [math]::Floor($TimeSpan.TotalDays)

        if ($NotificationThresholds -contains $DaysRemaining) {
            Write-Output "⚠️ Notification Triggered: $DisplayName expires in $DaysRemaining days."
            
            $Subject = "Azure App Secret Expiring: $DisplayName ($DaysRemaining days remaining)"
            $Body = @"
Hello,

The client secret for your App Registration '$DisplayName' (ID: $AppId) is set to expire on $($ExpiryDate.ToString('yyyy-MM-dd')).

Remaining time: $DaysRemaining day(s).

Please ensure you rotate this secret in the Azure Portal to avoid service interruption.

Regards,
CruzOps Automation
"@

            # Sending email via Graph API (requires Mail.Send permission)
            # Alternatively, you can use SendGrid or Azure Communication Services.
            # Here we log the intended email.
            Write-Output "📧 Sending email to $RecipientEmails..."
            
            # Placeholder for Graph SendMail implementation
            # ...
        }
    }
}

Write-Output "✅ Scan complete."
