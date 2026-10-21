import { createMcpServer } from "@/lib/mcp-server";
import { validateApiKey } from "@server/domain/api-keys";
import { NextRequest, NextResponse } from "next/server";

async function handleMcpRequest(req: NextRequest) {
  let userId: string | null = null;

  // Try API key authentication first (Authorization: Bearer mcp_xxx)
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const apiKey = authHeader.slice(7);
    if (apiKey.startsWith("mcp_")) {
      userId = await validateApiKey(apiKey);
    }
  }

  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized - provide a valid API key or sign in" },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Bearer realm="MCP Server"',
        },
      },
    );
  }

  try {
    // Get the JSON-RPC request
    const body = await req.json();
    
    // Create MCP server instance
    const mcpServer = createMcpServer(userId);
    
    // Handle the MCP request based on method
    const { method, params, id } = body;
    
    let result;
    
    switch (method) {
      case "initialize":
        result = {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: "daylock-task-manager",
            version: "1.0.0",
          },
        };
        break;
        
      case "tools/list":
        // Return the list of available tools
        result = {
          tools: [
            {
              name: "list_tasks",
              description: "Get all tasks from a list (defaults to inbox)",
              inputSchema: {
                type: "object",
                properties: {
                  listId: {
                    type: "string",
                    description: "Optional list ID. Defaults to user's inbox.",
                  },
                  includeCompleted: {
                    type: "boolean",
                    description: "Include completed tasks",
                    default: false,
                  },
                },
              },
            },
            {
              name: "create_task",
              description: "Create a new task",
              inputSchema: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Task title (required)" },
                  notes: { type: "string", description: "Optional notes/description" },
                  listId: { type: "string", description: "List ID (defaults to inbox)" },
                  priority: {
                    type: "string",
                    enum: ["none", "low", "medium", "high"],
                    description: "Task priority",
                  },
                  dueAt: { type: "string", description: "Due date/time in ISO format" },
                  estimatedMinutes: { type: "number", description: "Estimated duration" },
                  attentionCost: {
                    type: "string",
                    enum: ["deep", "light", "any"],
                    description: "Attention cost level",
                  },
                  pinToMyDay: { type: "boolean", description: "Pin to My Day" },
                },
                required: ["title"],
              },
            },
            {
              name: "complete_task",
              description: "Mark a task as completed",
              inputSchema: {
                type: "object",
                properties: {
                  taskId: { type: "string", description: "Task ID to complete" },
                },
                required: ["taskId"],
              },
            },
            {
              name: "update_task",
              description: "Update task properties",
              inputSchema: {
                type: "object",
                properties: {
                  taskId: { type: "string", description: "Task ID to update" },
                  title: { type: "string", description: "New title" },
                  notes: { type: "string", description: "New notes" },
                  priority: {
                    type: "string",
                    enum: ["none", "low", "medium", "high"],
                    description: "New priority",
                  },
                  dueAt: { type: "string", description: "New due date/time in ISO format" },
                  estimatedMinutes: { type: "number", description: "Estimated duration" },
                },
                required: ["taskId"],
              },
            },
            {
              name: "list_streams",
              description: "Get all life streams (non-inbox lists)",
              inputSchema: {
                type: "object",
                properties: {},
              },
            },
            {
              name: "get_my_day",
              description: "Get My Day items for a specific date",
              inputSchema: {
                type: "object",
                properties: {
                  date: {
                    type: "string",
                    description: "Date in YYYY-MM-DD format (defaults to today)",
                  },
                },
              },
            },
          ],
        };
        break;
        
      case "tools/call":
        // This would call the actual tool implementation
        // For now, return an error since we need to wire up the actual MCP server
        return NextResponse.json(
          {
            jsonrpc: "2.0",
            id,
            error: {
              code: -32601,
              message: "Tool calling not yet implemented in this version",
            },
          },
          { status: 200 }
        );
        
      default:
        return NextResponse.json(
          {
            jsonrpc: "2.0",
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          },
          { status: 200 }
        );
    }
    
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      result,
    });
    
  } catch (error) {
    console.error("MCP request error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

export const GET = handleMcpRequest;
export const POST = handleMcpRequest;
