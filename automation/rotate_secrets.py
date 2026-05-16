import os
import datetime
from azure.identity import DefaultAzureCredential
from azure.keyvault.secrets import SecretClient
from msgraph import GraphServiceClient
from msgraph.generated.models.password_credential import PasswordCredential
import requests

# --- CONFIGURATION ---
TENANT_ID = os.getenv("AZURE_TENANT_ID")
NOTIFY_EMAILS = ["Anto13franc@outlook.com", "sasafiyullah@outlook.com"]
EXPIRY_THRESHOLD_DAYS = 7
KEY_VAULT_URL = os.getenv("AZURE_KEYVAULT_URL") # Optional: update Key Vault if provided

# Email Provider Configuration (Placeholder for Azure Communication Services or SendGrid)
EMAIL_SERVICE_CONNECTION_STRING = os.getenv("AZURE_ACS_CONNECTION_STRING")

def send_email(to_emails, subject, body):
    """
    Sends email notification. 
    Implementation depends on the available service (ACS, SendGrid, etc.)
    """
    print(f"📧 [NOTIFICATION] To: {to_emails} | Subject: {subject}")
    print(f"Body: {body}")
    
    if EMAIL_SERVICE_CONNECTION_STRING:
        # Placeholder for Azure Communication Services (ACS) SDK implementation
        # from azure.communication.email import EmailClient
        # client = EmailClient.from_connection_string(EMAIL_SERVICE_CONNECTION_STRING)
        # ...
        pass

def rotate_secrets():
    credential = DefaultAzureCredential()
    graph_client = GraphServiceClient(credential)

    # 1. Fetch all App Registrations
    print("🔍 Fetching App Registrations...")
    # For demo/safety, we might want to filter for specific apps or tags
    apps = requests.get(
        "https://graph.microsoft.com/v1.0/applications",
        headers={"Authorization": f"Bearer {credential.get_token('https://graph.microsoft.com/.default').token}"}
    ).json().get("value", [])

    now = datetime.datetime.now(datetime.timezone.utc)

    for app in apps:
        app_name = app.get("displayName")
        app_id = app.get("appId")
        obj_id = app.get("id")
        credentials = app.get("passwordCredentials", [])

        print(f"📦 Checking App: {app_name} ({app_id})")

        for cred in credentials:
            end_date = datetime.datetime.fromisoformat(cred.get("endDateTime").replace("Z", "+00:00"))
            days_to_expiry = (end_date - now).days

            if days_to_expiry == EXPIRY_THRESHOLD_DAYS:
                print(f"⚠️ Secret for {app_name} expires in {days_to_expiry} days. Initiating rotation...")
                
                # 2. Send Warning Email
                warning_subject = f"ACTION REQUIRED: Azure App Secret Expiring in {days_to_expiry} Days"
                warning_body = f"""
                Hello Owners,
                
                The client secret for App Registration '{app_name}' (ID: {app_id}) is set to expire on {end_date.strftime('%Y-%m-%d')}.
                
                Our automation process will now automatically renew this secret to prevent any service interruption.
                Another email will be sent once the renewal is complete.
                
                Regards,
                CruzOps Automation
                """
                send_email(NOTIFY_EMAILS, warning_subject, warning_body)

                # 3. Generate New Secret
                print(f"🔄 Resetting credential for {app_name}...")
                new_cred_payload = {
                    "passwordCredential": {
                        "displayName": f"Auto-Renewed-{datetime.datetime.now().strftime('%Y%m%d')}"
                    }
                }
                
                response = requests.post(
                    f"https://graph.microsoft.com/v1.0/applications/{obj_id}/addPassword",
                    headers={"Authorization": f"Bearer {credential.get_token('https://graph.microsoft.com/.default').token}"},
                    json=new_cred_payload
                )
                
                if response.status_code == 200:
                    new_password = response.json().get("secretText")
                    print(f"✅ New secret generated for {app_name}.")

                    # 4. Update Key Vault (Optional but Recommended)
                    if KEY_VAULT_URL:
                        try:
                            kv_client = SecretClient(vault_url=KEY_VAULT_URL, credential=credential)
                            # We assume the secret name in Key Vault maps to the App Name or a specific convention
                            secret_name = app_name.replace(" ", "-").lower() + "-client-secret"
                            kv_client.set_secret(secret_name, new_password)
                            print(f"🔑 Updated Key Vault secret: {secret_name}")
                        except Exception as e:
                            print(f"❌ Failed to update Key Vault: {str(e)}")

                    # 5. Send Success Email
                    success_subject = f"SUCCESS: Azure App Secret Renewed for {app_name}"
                    success_body = f"""
                    Hello Owners,
                    
                    The client secret for App Registration '{app_name}' has been successfully renewed.
                    
                    Details:
                    - App ID: {app_id}
                    - New Expiry: {(now + datetime.timedelta(days=365)).strftime('%Y-%m-%d')} (Approx)
                    - Key Vault Updated: {'Yes' if KEY_VAULT_URL else 'No'}
                    
                    Please ensure your application picks up the new secret if it does not pull directly from Key Vault.
                    
                    Regards,
                    CruzOps Automation
                    """
                    send_email(NOTIFY_EMAILS, success_subject, success_body)
                else:
                    print(f"❌ Failed to rotate secret: {response.text}")

if __name__ == "__main__":
    rotate_secrets()
