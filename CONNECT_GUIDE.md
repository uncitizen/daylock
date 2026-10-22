# Connect Cursor & Claude to Your MCP Server

## Step 1: Create an API Key

1. **Sign in to your app**:
   ```
   https://daylock-xi.vercel.app/login
   ```
   Use your Google account

2. **Navigate to API Keys page**:
   ```
   https://daylock-xi.vercel.app/api-keys
   ```

3. **Create a key**:
   - Enter a name like "Cursor" or "Claude Desktop"
   - Click "Create Key"
   - **IMMEDIATELY copy the key** - it looks like:
     ```
     mcp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
     ```
   - You'll NEVER see this key again, so save it somewhere safe!

4. **Optional**: Create separate keys for Cursor and Claude for better tracking

---

## Step 2A: Configure Cursor

### For Cursor Desktop/IDE:

1. **Open Cursor Settings**:
   - Click Settings icon or press `Cmd/Ctrl + ,`
   - Go to **Features** → **MCP Servers**

2. **Add a new MCP server**:
   - Click "Add MCP Server" or "+"
   - Enter these settings:
     ```
     Name: Daylock Task Manager
     URL: https://daylock-xi.vercel.app/api/mcp
     Transport: HTTP
     ```

3. **Add the Authorization header**:
   - Header Name: `Authorization`
   - Header Value: `Bearer YOUR_API_KEY`
   
   Replace `YOUR_API_KEY` with the key you copied (should start with `mcp_`)

4. **Save and reload** Cursor

5. **Test it**:
   - Open a chat in Cursor
   - Type: "List my tasks"
   - You should see your tasks!

---

## Step 2B: Configure Claude Desktop

### For Claude Desktop App:

1. **Find your Claude config file**:
   
   **macOS**:
   ```bash
   ~/Library/Application Support/Claude/claude_desktop_config.json
   ```
   
   **Windows**:
   ```
   %APPDATA%\Claude\claude_desktop_config.json
   ```
   
   **Linux**:
   ```bash
   ~/.config/Claude/claude_desktop_config.json
   ```

2. **Edit the config file** (create it if it doesn't exist):
   ```json
   {
     "mcpServers": {
       "daylock": {
         "command": "npx",
         "args": [
           "mcporter",
           "https://daylock-xi.vercel.app/api/mcp",
           "--header",
           "Authorization: Bearer YOUR_API_KEY"
         ]
       }
     }
   }
   ```
   
   Note: No `--allow-http` flag needed since we're using HTTPS!

3. **Replace `YOUR_API_KEY`** with your actual API key

4. **Save the file** and **restart Claude Desktop**

5. **Test it**:
   - Open Claude Desktop
   - In a new conversation, type: "What tasks do I have?"
   - Claude should be able to access your MCP tools!

---

## Step 3: Verify Connection

### Test Commands for Both:

Try these commands to verify the MCP tools are working:

1. **List tasks**:
   ```
   List my tasks
   ```

2. **Create a task**:
   ```
   Create a task called "Test MCP integration" with high priority and pin it to My Day
   ```

3. **View streams**:
   ```
   What life streams do I have?
   ```

4. **Check My Day**:
   ```
   What's on My Day today?
   ```

5. **Complete a task**:
   ```
   Mark task [task-id] as complete
   ```

---

## Troubleshooting

### "Unauthorized" Error
- Check that your API key starts with `mcp_`
- Make sure you included `Bearer ` before the key
- Verify the key hasn't been revoked at https://daylock-xi.vercel.app/api-keys
- Make sure you created the key on the production site (not localhost)

### "Connection refused" / "Cannot connect"
- Check that the production site is accessible: https://daylock-xi.vercel.app
- For Claude, ensure `mcporter` is installed: `npm install -g mcporter`
- Try the URL in your browser to verify it's up

### Tools not appearing
- Restart Cursor/Claude Desktop after configuration
- Check the config file syntax is valid JSON
- Look for error messages in the app console

### "Key not working"
- If you lost your key, create a new one at /api-keys
- Revoke old keys you're not using
- Each key is single-use at creation - can't retrieve it later

---

## Development Setup (Optional)

If you want to use a local dev server instead:

1. Run `npm run dev` locally
2. Create a key at http://localhost:3000/api-keys
3. Update your MCP config URLs to use:
   ```
   http://localhost:3000/api/mcp
   ```
4. Add `--allow-http` flag for Claude Desktop
5. Keep development and production keys separate

---

## Available MCP Tools

Once connected, these tools are available:

1. **list_tasks** - Get tasks from any list (defaults to inbox)
2. **create_task** - Create new tasks with full options
3. **complete_task** - Mark tasks as complete
4. **update_task** - Update task properties
5. **list_streams** - View all life streams
6. **get_my_day** - See My Day items for any date
