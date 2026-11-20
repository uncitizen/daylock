import {
  MCP_TOOL_DEFINITIONS,
  callMcpTool,
} from "@/lib/mcp-tools";
import { validateApiKey } from "@server/domain/api-keys";
import { NextRequest, NextResponse } from "next/server";

async function handleMcpRequest(req: NextRequest) {
  let userId: string | null = null;

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
    const body = await req.json();
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
            version: "1.1.0",
          },
        };
        break;

      case "notifications/initialized":
        return new NextResponse(null, { status: 204 });

      case "tools/list":
        result = {
          tools: MCP_TOOL_DEFINITIONS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        };
        break;

      case "tools/call": {
        const { name: toolName, arguments: toolArgs } = params ?? {};
        try {
          const toolResult = await callMcpTool(userId, toolName, toolArgs ?? {});
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: toolResult,
          });
        } catch (error) {
          console.error("Tool execution error:", error);
          return NextResponse.json(
            {
              jsonrpc: "2.0",
              id,
              error: {
                code: -32603,
                message: `Tool execution failed: ${String(error)}`,
              },
            },
            { status: 200 },
          );
        }
      }

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
          { status: 200 },
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
      { status: 500 },
    );
  }
}

export const GET = handleMcpRequest;
export const POST = handleMcpRequest;
