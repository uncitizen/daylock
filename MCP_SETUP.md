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

The MCP server uses **NextAuth session-based authentication**. This means:

- You must be signed in to your Daylock account
- The MCP client must send your session cookie with each request
- Each user can only access their own tasks and workspaces

## Setup Instructions

### Option 1: Using with Cursor (Recommended)

1. Make sure your development server is running:
   ```bash
   npm run dev
   ```

2. In Cursor, open Settings → Features → MCP Servers

3. Add a new server with these settings:
   - **Name**: Daylock Task Manager
   - **URL**: `http://localhost:3000/api/mcp`
   - **Transport**: HTTP

4. Sign in to your Daylock app in a browser (http://localhost:3000/login)

5. Copy your session cookie:
   - Open browser DevTools (F12)
   - Go to Application → Cookies → `http://localhost:3000`
   - Find the cookie named `authjs.session-token` (or similar)
   - Copy its value

6. In Cursor's MCP settings, add the session cookie as a header:
   - Header name: `Cookie`
   - Header value: `authjs.session-token=YOUR_COOKIE_VALUE`

7. Test it by asking Cursor: "List my tasks"

### Option 2: Using with Claude Desktop

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Open Claude Desktop settings and edit the MCP configuration file

3. Add this configuration:
   ```json
   {
     "mcpServers": {
       "daylock": {
         "command": "npx",
         "args": ["mcporter", "http://localhost:3000/api/mcp", "--allow-http"],
         "env": {
           "COOKIE": "authjs.session-token=YOUR_COOKIE_VALUE"
         }
       }
     }
   }
   ```

4. Get your session cookie (see steps in Option 1)

5. Replace `YOUR_COOKIE_VALUE` with your actual cookie value

6. Restart Claude Desktop

7. Test by asking: "What tasks do I have?"

### Option 3: Production Deployment

For production use, you'll want to implement proper API key authentication instead of session cookies.

**Recommended approach:**

1. Add an API key authentication system:
   - Generate secure API keys per user
   - Store them hashed in the database
   - Accept them via `Authorization: Bearer <key>` header

2. Update `/src/app/api/mcp/route.ts` to check for API key:
   ```typescript
   // Check for API key first
   const authHeader = c.req.header("authorization");
   if (authHeader?.startsWith("Bearer ")) {
     const apiKey = authHeader.slice(7);
     // Verify API key against database
   }
   ```

3. Deploy your app to production

4. Update MCP client to use production URL:
   - URL: `https://your-domain.com/api/mcp`
   - Header: `Authorization: Bearer YOUR_API_KEY`

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

1. **Session cookies are temporary** - They expire after some time, so you'll need to refresh them periodically

2. **Never commit cookies or API keys** - Keep them out of version control

3. **Use HTTPS in production** - Never send credentials over plain HTTP

4. **Implement rate limiting** - Add rate limiting to prevent abuse

5. **Consider OAuth** - For production, implement proper OAuth flow instead of long-lived credentials

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
