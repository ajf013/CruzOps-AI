# Azure App Secret Rotation Automation

This governance tool monitors Azure App Registration client secrets and ensures owners are notified well before they expire.

## 🏗️ Architecture
- **System**: Azure Automation Account (`CruzOps-Automation`)
- **Identity**: System-Assigned Managed Identity
- **Logic**: PowerShell 7.2 Runbook (`Check-AppExpiry`)
- **Schedule**: Daily check at 00:00 UTC

## 📧 Notification Workflow
The system scans all App Registrations in the tenant and triggers an email notification to the owners at the following intervals:
- **30 Days**: First warning for proactive planning.
- **15 Days**: Second warning.
- **7 Days**: Critical warning - escalation recommended.
- **1 Day**: Final warning - immediate action required.

## 🛠️ Components
- `Check-AppExpiry.ps1`: The core PowerShell script that uses the Managed Identity to call Microsoft Graph API.

## 🚀 Setup Instructions

### 1. Enable Permissions
The Managed Identity requires **Application.Read.All** Graph permissions to scan the tenant.
1. Go to **Enterprise Applications** in the Azure Portal.
2. Search for `CruzOps-Automation`.
3. Under **Permissions**, ensure `Application.Read.All` is consented.

### 2. Link Schedule
1. In the Automation Account, go to **Runbooks** > `Check-AppExpiry`.
2. Go to **Schedules** > **Add a schedule**.
3. Link the existing `Daily-AppExpiryCheck` schedule to the runbook.

### 3. Email Configuration
To enable email sending, ensure the Managed Identity has **Mail.Send** permissions, or update the script to call your preferred mail provider (SendGrid/ACS).
