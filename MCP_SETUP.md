# MCP Server Setup for Daylock Task Manager

This document explains how to use the MCP (Model Context Protocol) server for the Daylock task manager.

## What is MCP?

MCP (Model Context Protocol) allows AI assistants like Claude, Cursor, and ChatGPT to interact with your task manager programmatically through a standardized protocol. Once configured, you can ask your AI assistant to:

- Create tasks
- List tasks and streams
- Complete tasks
- Update task details
- View your My Day list
- And more!

## Available Tools

The MCP server exposes these tools:

1. **`list_tasks`** - Get all tasks from a list (defaults to inbox)
2. **`create_task`** - Create a new task with optional properties
3. **`complete_task`** - Mark a task as complete
4. **`update_task`** - Update task properties
5. **`list_streams`** - List all life streams (non-inbox lists)
6. **`get_my_day`** - Get items pinned to My Day

## Authentication

The MCP server supports **two authentication methods**:

### Option 1: API Keys (Recommended)

- **Long-lived credentials** that don't expire (unless you set an expiration)
- **Easy to manage** - Create and revoke keys from the web UI
- **Perfect for AI assistants** - No need to refresh credentials
- Simple `Authorization: Bearer mcp_xxxxx` header

### Option 2: Session Cookies (Alternative)

- Uses NextAuth session-based authentication
- Requires signing in through the web app
- Session cookies expire periodically (you'll need to refresh them)
- Each user can only access their own tasks and workspaces

## Setup Instructions

### Option 1: Using with Cursor + API Keys (Recommended)

1. Make sure your development server is running:
   ```bash
   npm run dev
   ```

2. **Create an API key**:
   - Sign in to your Daylock app at http://localhost:3000/login
   - Navigate to http://localhost:3000/api-keys
   - Click "Create Key", give it a name (e.g., "Cursor")
   - **Copy the API key immediately** (you won't see it again!)

3. **Configure Cursor**:
   - Open Settings → Features → MCP Servers
   - Add a new server with these settings:
     - **Name**: Daylock Task Manager
     - **URL**: `http://localhost:3000/api/mcp`
     - **Transport**: HTTP
     - **Header name**: `Authorization`
     - **Header value**: `Bearer YOUR_API_KEY`

4. **Test it**: Ask Cursor "List my tasks"

That's it! Your API key won't expire (unless you set an expiration date), so you won't need to update it.

### Option 2: Using with Claude Desktop + API Keys

1. **Create an API key** (if you haven't already):
   - Sign in at http://localhost:3000/login
   - Go to http://localhost:3000/api-keys
   - Create a new key and copy it immediately

2. **Configure Claude Desktop**:
   - Open Claude Desktop settings
   - Edit the MCP configuration file
   - Add this configuration:
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

3. Replace `YOUR_API_KEY` with your actual API key

4. Restart Claude Desktop

5. Test by asking: "What tasks do I have?"

### Option 3: Production Deployment

API key authentication is already implemented and works great in production!

1. Deploy your app to production (it's already deployed on Vercel)

2. Sign in to your production app

3. Navigate to `/api-keys` and create a production API key

4. Update your MCP client configuration:
   - URL: `https://your-production-domain.com/api/mcp`
   - Header: `Authorization: Bearer YOUR_PRODUCTION_API_KEY`

That's it! Your production MCP server is ready to use.

## Testing the MCP Server

### Using mcporter (CLI tool)

Install mcporter:
```bash
npm install -g mcporter
```

List available tools:
```bash
mcporter list http://localhost:3000/api/mcp --allow-http --schema
```

Create a task:
```bash
mcporter call "http://localhost:3000/api/mcp.create_task" \
  title="Test task from MCP" \
  pinToMyDay=true \
  --allow-http
```

### Using curl

List tasks:
```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Cookie: authjs.session-token=YOUR_COOKIE" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "list_tasks",
      "arguments": {}
    },
    "id": 1
  }'
```

## Security Considerations

⚠️ **Important Security Notes:**

1. **API keys are like passwords** - Keep them secret and never commit them to version control

2. **Store keys securely** - API keys are hashed (SHA-256) in the database and can never be recovered

3. **Revoke compromised keys immediately** - If a key is exposed, revoke it from the API Keys page

4. **Use HTTPS in production** - Never send API keys over plain HTTP

5. **Set expiration dates** - For extra security, set expiration dates when creating keys

6. **One key per client** - Create separate keys for each AI assistant for easier management

## Troubleshooting

### "Unauthorized" error

- Make sure you're signed in to Daylock
- Check that your session cookie is valid and not expired
- Sign out and sign back in to get a fresh cookie

### "List not found" error

- The user may not have access to the specified list
- Check that the list ID is correct
- Try without specifying listId to use the inbox

### MCP server not connecting

- Ensure the dev server is running (`npm run dev`)
- Check that the URL is correct (`http://localhost:3000/api/mcp`)
- Verify the port number (default is 3000)

### Tools not showing up

- Restart your MCP client after configuration changes
- Check the MCP server logs in your terminal
- Verify the cookie is being sent with requests

## Next Steps

- Implement API key authentication for production use
- Add more MCP tools (e.g., create goals, manage shopping lists)
- Set up rate limiting and monitoring
- Add webhook support for real-time updates
