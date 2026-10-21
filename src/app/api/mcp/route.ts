import { StreamableHTTPTransport } from "@hono/mcp";
import { createMcpServer } from "@/lib/mcp-server";
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

async function handleMcpRequest(req: NextRequest) {
  // Get NextAuth session from the request
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized - please sign in" },
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
  const mcpServer = createMcpServer(session.user.id);
  const transport = new StreamableHTTPTransport();

  // Connect the MCP server to the transport
  if (!mcpServer.isConnected()) {
    await mcpServer.connect(transport);
  }

  // Create a minimal Hono context-like object for the transport
  const url = new URL(req.url);
  const context = {
    req: {
      raw: req,
      method: req.method,
      url: url.toString(),
      header: (name: string) => req.headers.get(name),
      json: () => req.json(),
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
  };

  // Handle the request through the transport
  return transport.handleRequest(context as any);
}

export const GET = handleMcpRequest;
export const POST = handleMcpRequest;
