import { Hono } from "hono";
import { StreamableHTTPTransport } from "@hono/mcp";
import { createMcpServer } from "@/lib/mcp-server";
import { auth } from "@/lib/auth";

const app = new Hono();

// Handle both GET and POST for MCP
app.all("/", async (c) => {
  // Get NextAuth session from the request
  const session = await auth();

  if (!session?.user?.id) {
    return c.json(
      { error: "Unauthorized - please sign in" },
      401,
      {
        "WWW-Authenticate": 'Bearer realm="MCP Server"',
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

  // Handle the request through the transport
  return transport.handleRequest(c);
});

// Export Next.js route handlers
export const GET = async (req: Request) => {
  return app.fetch(req);
};

export const POST = async (req: Request) => {
  return app.fetch(req);
};
