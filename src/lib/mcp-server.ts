import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MCP_TOOL_DEFINITIONS, callMcpTool } from "@/lib/mcp-tools";

/**
 * SDK-backed MCP server. The HTTP route uses the shared catalog in mcp-tools;
 * this registers the same tools for transports that speak the SDK API.
 */
export function createMcpServer(userId: string) {
  const mcpServer = new McpServer({
    name: "daylock-task-manager",
    version: "1.1.0",
  });

  // Loose args schema — handlers validate and return structured errors.
  const AnyArgs = z.record(z.string(), z.any());

  for (const tool of MCP_TOOL_DEFINITIONS) {
    mcpServer.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: AnyArgs,
      },
      async (args) => callMcpTool(userId, tool.name, args ?? {}),
    );
  }

  return mcpServer;
}
