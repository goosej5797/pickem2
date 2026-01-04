# Azure Function App Setup Guide - SQL Integration

## Overview
This guide walks you through setting up your Azure Function App to connect to Azure SQL Database and implement the core API endpoints for your sports league application.

---

## Step 1: Install Dependencies

In your Function App project directory:

```bash
npm install mssql
npm install bcrypt
npm install jsonwebtoken
npm install @azure/identity
```

**Package purposes:**
- `mssql` - SQL Server driver for Node.js
- `bcrypt` - Password hashing
- `jsonwebtoken` - JWT token generation/verification
- `@azure/identity` - Azure authentication (for Key Vault access)

---

## Step 2: Project Structure

Organize your Function App with this structure:

```
function-app/
├── register/
│   ├── index.js           # Registration function
│   └── function.json      # Function configuration
├── login/
│   ├── index.js           # Login function
│   └── function.json
├── createLeague/
│   ├── index.js           # Create league function
│   └── function.json
├── services/
│   ├── userService.js     # User data access layer
│   └── leagueService.js   # League data access layer
├── utils/
│   └── auth.js            # Authentication utilities
├── db.js                  # Database connection module
├── package.json
└── host.json
```

---

## Step 3: Add Connection String to Key Vault

You already have your SQL connection string in Key Vault. Now reference it in your Function App:

### Via Azure Portal:
1. Go to your **Function App** → **Configuration** → **Application settings**
2. Click **+ New application setting**
3. Name: `SQL_CONNECTION_STRING`
4. Value: `@Microsoft.KeyVault(SecretUri=https://your-keyvault.vault.azure.net/secrets/SqlConnectionString/)`
5. Click **OK** → **Save**

### Via Azure CLI:
```bash
FUNCTION_APP_NAME="your-function-app-name"
KEYVAULT_NAME="your-keyvault-name"
RESOURCE_GROUP="your-resource-group"

# Get the Key Vault secret URI
SECRET_URI=$(az keyvault secret show \
  --name SqlConnectionString \
  --vault-name $KEYVAULT_NAME \
  --query id -o tsv)

# Add to Function App settings
az functionapp config appsettings set \
  --name $FUNCTION_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --settings "SQL_CONNECTION_STRING=@Microsoft.KeyVault(SecretUri=$SECRET_URI)"
```

---

## Step 4: Add JWT Secret to Key Vault

Generate and store a secure JWT secret:

```bash
# Generate a random secret (32 bytes, base64 encoded)
JWT_SECRET=$(openssl rand -base64 32)

# Store in Key Vault
az keyvault secret set \
  --vault-name $KEYVAULT_NAME \
  --name JwtSecret \
  --value "$JWT_SECRET"

# Reference in Function App
SECRET_URI=$(az keyvault secret show \
  --name JwtSecret \
  --vault-name $KEYVAULT_NAME \
  --query id -o tsv)

az functionapp config appsettings set \
  --name $FUNCTION_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --settings "JWT_SECRET=@Microsoft.KeyVault(SecretUri=$SECRET_URI)"
```

---

## Step 5: Grant Function App Access to Key Vault

Your Function App needs permission to read secrets from Key Vault:

```bash
# Enable managed identity on Function App (if not already enabled)
az functionapp identity assign \
  --name $FUNCTION_APP_NAME \
  --resource-group $RESOURCE_GROUP

# Get the principal ID
PRINCIPAL_ID=$(az functionapp identity show \
  --name $FUNCTION_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query principalId -o tsv)

# Grant access to Key Vault
az keyvault set-policy \
  --name $KEYVAULT_NAME \
  --object-id $PRINCIPAL_ID \
  --secret-permissions get list
```

---

## Step 6: File Placement

Copy the provided files into your Function App project:

1. **db.js** → Root of your project
2. **userService.js** → `/services/userService.js`
3. **leagueService.js** → `/services/leagueService.js`
4. **auth.js** → `/utils/auth.js`
5. **register-function.js** → `/register/index.js`
6. **register-function.json** → `/register/function.json`
7. **login-function.js** → `/login/index.js`
8. **createLeague-function.js** → `/createLeague/index.js`

---

## Step 7: Update host.json

Ensure your `host.json` has proper configuration:

```json
{
  "version": "2.0",
  "logging": {
    "applicationInsights": {
      "samplingSettings": {
        "isEnabled": true,
        "maxTelemetryItemsPerSecond": 20
      }
    }
  },
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[3.*, 4.0.0)"
  },
  "functionTimeout": "00:05:00"
}
```

---

## Step 8: Update CORS Settings

Allow your Static Web App to call your Function App:

### Via Portal:
1. Go to Function App → **CORS**
2. Add your Static Web App URL (e.g., `https://your-app.azurestaticapps.net`)
3. Add `http://localhost:8080` for local development
4. Save

### Via CLI:
```bash
az functionapp cors add \
  --name $FUNCTION_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --allowed-origins "https://your-app.azurestaticapps.net" "http://localhost:8080"
```

---

## Step 9: Local Development Setup

For local testing, create a `local.settings.json` file (don't commit this!):

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "SQL_CONNECTION_STRING": "Server=tcp:your-server.database.windows.net,1433;Initial Catalog=sportsleague-db;User ID=sqladmin;Password=YourPassword;",
    "JWT_SECRET": "your-local-jwt-secret-for-testing"
  },
  "Host": {
    "CORS": "*"
  }
}
```

---

## Step 10: Test Locally

```bash
# Start the Function App locally
npm start

# Or use Azure Functions Core Tools
func start
```

**Test the registration endpoint:**
```bash
curl -X POST http://localhost:7071/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "username": "testuser",
    "password": "TestPassword123",
    "firstName": "Test",
    "lastName": "User"
  }'
```

**Test the login endpoint:**
```bash
curl -X POST http://localhost:7071/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123"
  }'
```

---

## Step 11: Deploy to Azure

```bash
# Deploy Function App
func azure functionapp publish your-function-app-name

# Or use VS Code Azure Functions extension
# Right-click on Function App → Deploy to Function App
```

---

## Step 12: Verify Deployment

After deployment, test your endpoints:

```bash
# Replace with your actual Function App URL
FUNCTION_URL="https://your-function-app.azurewebsites.net"

# Test registration
curl -X POST $FUNCTION_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "friend1@example.com",
    "username": "friend1",
    "password": "SecurePass123",
    "firstName": "Friend",
    "lastName": "One"
  }'
```

---

## API Endpoints Created

### Authentication
- **POST** `/api/auth/register` - Create new user account
- **POST** `/api/auth/login` - Login and get JWT token

### Leagues
- **POST** `/api/leagues/create` - Create a new league (requires auth)

---

## Next Steps

Now that your backend is set up, you need to:

1. **Create additional API endpoints:**
   - Join league (POST `/api/leagues/join`)
   - Get user's leagues (GET `/api/leagues/my-leagues`)
   - Get league details (GET `/api/leagues/:id`)
   - Create competition (POST `/api/competitions/create`)
   - Submit picks (POST `/api/picks/submit`)
   - Get leaderboard (GET `/api/leaderboard/:competitionId`)

2. **Update your Vue frontend:**
   - Create API service to call these endpoints
   - Implement authentication flow
   - Store JWT token (localStorage or Vuex)

3. **Test the complete flow:**
   - Register user
   - Login
   - Create league
   - Invite friends
   - Create competition
   - Submit picks

---

## Troubleshooting

### "Cannot connect to SQL Server"
- Check firewall rules in Azure SQL
- Verify connection string is correct
- Ensure Function App has network access

### "Unauthorized" errors
- Verify JWT_SECRET is set correctly
- Check token expiration
- Ensure Authorization header format: `Bearer <token>`

### "Key Vault access denied"
- Verify managed identity is enabled
- Check Key Vault access policies
- Wait a few minutes after granting permissions

### Local development connection issues
- Add your IP to SQL Server firewall
- Use SQL Server authentication (not Azure AD) for local dev
- Check connection string format

---

## Security Checklist

- ✅ Connection string stored in Key Vault
- ✅ JWT secret stored in Key Vault
- ✅ Managed identity enabled
- ✅ CORS configured (not using `*` in production)
- ✅ Password hashing with bcrypt
- ✅ Input validation on all endpoints
- ✅ SQL injection prevention (parameterized queries)

---

## Cost Optimization

- Function App consumption plan: Pay per execution
- SQL Database serverless: Pauses after 1 hour
- Estimated monthly cost: $5-20 (vs $25-50 with Cosmos DB)

---

## Monitoring

Enable Application Insights to monitor:
- API response times
- Error rates
- Database connection issues
- User activity

Access via: Function App → Application Insights → Logs

---

## What's Next?

Would you like me to:
1. Create the remaining API endpoints (join league, submit picks, etc.)?
2. Create the Vue frontend API service layer?
3. Set up a complete authentication flow example?
4. Create admin functions for managing competitions?

Let me know what you'd like to tackle next!
