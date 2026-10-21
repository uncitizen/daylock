import { StreamableHTTPTransport } from "@hono/mcp";
import { createMcpServer } from "@/lib/mcp-server";
import { auth } from "@/lib/auth";
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

  // Fall back to session authentication if no valid API key
  if (!userId) {
    const session = await auth();
    userId = session?.user?.id || null;
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

  // Create a new MCP server instance with the user's ID
  // This ensures each request is scoped to the authenticated user
  const mcpServer = createMcpServer(userId);
  const transport = new StreamableHTTPTransport();

  // Connect the MCP server to the transport
  if (!mcpServer.isConnected()) {
    await mcpServer.connect(transport);
  }

  // Create a minimal Hono context-like object for the transport
  const url = new URL(req.url);
  
  try {
    const context = {
      req: {
        raw: req,
        method: req.method,
        url: url.toString(),
        header: (name: string) => req.headers.get(name),
        json: async () => {
          try {
            return await req.json();
          } catch {
            return {};
          }
        },
      },
      json: (data: any, status?: number, headers?: Record<string, string>) => {
        return NextResponse.json(data, { status, headers });
      },
      text: (data: string, status?: number, headers?: Record<string, string>) => {
        return new NextResponse(data, { status, headers });
      },
      body: (data: any, init?: ResponseInit) => {
        return new NextResponse(data, init);
      },
      newResponse: (data: any, init?: ResponseInit) => {
        return new NextResponse(data, init);
      },
    };

    // Handle the request through the transport
    return await transport.handleRequest(context as any);
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
