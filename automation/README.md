# Azure App Secret Rotation Automation

This tool automates the lifecycle of Azure App Registration client secrets.

## Features
- **Daily Monitoring**: Scans for secrets expiring in 7 days.
- **Auto-Notification**: Emails owners 7 days before and immediately after renewal.
- **Auto-Rotation**: Generates new secrets via Microsoft Graph API.
- **Key Vault Sync**: (Optional) Updates secrets in Azure Key Vault.

## Setup Instructions

### 1. Azure Permissions
Grant your GitHub Action Service Principal the following permissions in **Microsoft Entra ID**:
- `Application.ReadWrite.All`
- `Directory.Read.All`

### 2. GitHub Secrets
Add the following secrets to your GitHub repository (`Settings > Secrets and variables > Actions`):
- `AZURE_CLIENT_ID`: The Client ID of the automation Service Principal.
- `AZURE_TENANT_ID`: Your Azure Tenant ID.
- `AZURE_SUBSCRIPTION_ID`: Your Azure Subscription ID.
- `AZURE_KEYVAULT_URL`: (Optional) The URL of your Key Vault.
- `AZURE_ACS_CONNECTION_STRING`: (Optional) Connection string for Azure Communication Services if using email SDK.

### 3. Email Recipients
The script is currently configured to notify:
- `Anto13franc@outlook.com`
- `sasafiyullah@outlook.com`

You can modify these in `automation/rotate_secrets.py`.
