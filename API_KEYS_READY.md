# ✅ API Key Authentication is Ready!

## What Changed

I've implemented **API key authentication** for your MCP server! No more dealing with expiring session cookies.

## What You Get

✅ **Long-lived credentials** - API keys don't expire (unless you set an expiration date)  
✅ **Easy management** - Create and revoke keys from the web UI  
✅ **Secure storage** - Keys are SHA-256 hashed, never stored in plaintext  
✅ **Simple usage** - Just `Authorization: Bearer mcp_xxxxx` header  
✅ **Perfect for AI assistants** - Set it once and forget it  

## How to Use

### Step 1: Create an API Key

1. Sign in to your app at http://localhost:3000/login
2. Navigate to http://localhost:3000/api-keys
3. Click "Create Key" and give it a name (e.g., "Cursor", "Claude Desktop")
4. **Copy the API key immediately** - you won't see it again!

### Step 2: Configure Your AI Assistant

#### For Cursor:
- Settings → Features → MCP Servers
- Add new server:
  - URL: `http://localhost:3000/api/mcp`
  - Header name: `Authorization`
  - Header value: `Bearer YOUR_API_KEY`

#### For Claude Desktop:
Edit your MCP config file:
```json
{
  "mcpServers": {
    "daylock": {
      "command": "npx",
      "args": ["mcporter", "http://localhost:3000/api/mcp", "--allow-http"],
      "env": {
        "AUTHORIZATION": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

### Step 3: Test It

Ask your AI assistant:
- "List my tasks"
- "Create a task called 'Test API key' with high priority"
- "Show me my life streams"

## Technical Details

### Database Schema

New `api_keys` table:
```sql
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,        -- SHA-256 hash
    "prefix" TEXT NOT NULL,          -- First 10 chars for display
    "lastUsedAt" TIMESTAMP(3),       -- Tracks usage
    "expiresAt" TIMESTAMP(3),        -- Optional expiration
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Security Features

1. **Cryptographic hashing** - Keys are hashed with SHA-256 before storage
2. **Prefix storage** - Only first 10 characters stored for display (e.g., `mcp_abc123...`)
3. **Never recoverable** - Plaintext keys are never stored and can't be recovered
4. **Secure generation** - 32 random bytes (256 bits) from `crypto.randomBytes()`
5. **Last used tracking** - Monitor which keys are actively used
6. **Optional expiration** - Set expiration dates for temporary access

### API Endpoints

#### Create a key:
```bash
POST /api/v1/api-keys
Content-Type: application/json

{
  "name": "My API Key",
  "expiresInDays": 90  // optional
}

Response:
{
  "apiKey": {
    "id": "...",
    "key": "mcp_xxxxxxxxxxxxxxxxxxxxx",  // Only shown once!
    "prefix": "mcp_abc123",
    "name": "My API Key",
    "createdAt": "...",
    "expiresAt": "..."
  },
  "warning": "Save this key now - it will not be shown again!"
}
```

#### List keys:
```bash
GET /api/v1/api-keys

Response:
{
  "keys": [
    {
      "id": "...",
      "name": "My API Key",
      "prefix": "mcp_abc123",
      "lastUsedAt": "...",
      "expiresAt": null,
      "createdAt": "..."
    }
  ]
}
```

#### Revoke a key:
```bash
DELETE /api/v1/api-keys/:id

Response:
{
  "message": "API key revoked successfully"
}
```

### MCP Route Authentication

The MCP route now checks for API keys first:

```typescript
// Try API key authentication first
const authHeader = req.headers.get("authorization");
if (authHeader?.startsWith("Bearer ")) {
  const apiKey = authHeader.slice(7);
  if (apiKey.startsWith("mcp_")) {
    userId = await validateApiKey(apiKey);
  }
}

// Fall back to session authentication if no valid API key
if (!userId) {
  const session = await auth();
  userId = session?.user?.id || null;
}
```

## Files Added/Modified

### New Files:
- ✅ `prisma/migrations/20261021_add_api_keys/migration.sql` - Database migration
- ✅ `server/domain/api-keys.ts` - Domain logic for key management
- ✅ `src/app/(app)/api-keys/page.tsx` - Web UI for key management
- ✅ `src/app/api/v1/api-keys/route.ts` - API endpoints (create, list)
- ✅ `src/app/api/v1/api-keys/[id]/route.ts` - API endpoint (revoke)

### Modified Files:
- ✅ `prisma/schema.prisma` - Added ApiKey model
- ✅ `src/app/api/mcp/route.ts` - Added API key authentication
- ✅ `MCP_SETUP.md` - Updated with API key instructions

## Migration Notes

The migration is already created at:
```
prisma/migrations/20261021_add_api_keys/migration.sql
```

To apply it to your database, run:
```bash
npx prisma migrate deploy
```

Or if you're using Prisma Studio locally:
```bash
npx prisma migrate dev
```

## Benefits Over Session Cookies

| Feature | API Keys | Session Cookies |
|---------|----------|-----------------|
| Expiration | Never (optional) | Hours/Days |
| Management | Easy web UI | Manual refresh |
| Revocation | Instant | N/A |
| Multiple clients | One key each | Share cookie |
| Security | Hashed, tracked | Session-based |
| Setup | One-time | Periodic refresh |

## Next Steps

1. ✅ **Create your first API key** at http://localhost:3000/api-keys
2. ✅ **Configure your AI assistant** with the key
3. ✅ **Test the MCP tools** - no more cookie expiration!
4. ✅ **Check deployment** - Once Vercel finishes building, API keys work in production too

---

**The API key system is fully implemented and ready to use!** 🎉

No more dealing with expiring session cookies. Create a key once and use it forever (or until you revoke it).
