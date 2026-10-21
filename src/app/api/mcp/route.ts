import { Hono } from "hono";
import { StreamableHTTPTransport } from "@hono/mcp";
import { createMcpServer } from "@/lib/mcp-server";
import { validateApiKey } from "@server/domain/api-keys";

// Create Hono app at module level
const app = new Hono();

// Auth middleware
app.use("*", async (c, next) => {
  let userId: string | null = null;

  // Try API key authentication first (Authorization: Bearer mcp_xxx)
  const authHeader = c.req.header("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const apiKey = authHeader.slice(7);
    if (apiKey.startsWith("mcp_")) {
      userId = await validateApiKey(apiKey);
    }
  }

  if (!userId) {
    return c.json(
      { error: "Unauthorized - provide a valid API key or sign in" },
      401,
      {
        "WWW-Authenticate": 'Bearer realm="MCP Server"',
      },
    );
  }

  // Store userId in context
  c.set("userId", userId);
  await next();
});

// MCP endpoint
app.all("/", async (c) => {
  const userId = c.get("userId") as string;
  
  try {
    // Create a new MCP server instance with the user's ID
    const mcpServer = createMcpServer(userId);
    const transport = new StreamableHTTPTransport();

    // Connect the MCP server to the transport
    if (!mcpServer.isConnected()) {
      await mcpServer.connect(transport);
    }

    // Handle the request through the transport
    return transport.handleRequest(c);
  } catch (error) {
    console.error("MCP request error:", error);
    return c.json(
      { error: "Internal server error", details: String(error) },
      500
    );
  }
});

// Export Next.js route handlers that use Hono
export const GET = (req: Request) => app.fetch(req);
export const POST = (req: Request) => app.fetch(req);
