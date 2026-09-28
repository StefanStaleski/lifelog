import type { McpTool } from "../tool";
import { getDailySummary, getTrend, queryDaysTool } from "./days";
import { getCheckins, getDataHealth, getLastNight, getTimeBreakdownTool } from "./life";

/**
 * Every tool the MCP server exposes, in the order clients list them. To add one: write it with
 * `defineTool` in a file in this folder (read-only, units in field names, reuse lib/ queries) and
 * append it here; the server and the registry test pick it up.
 */
export const TOOLS: McpTool[] = [
  getDailySummary,
  getLastNight,
  getTrend,
  getTimeBreakdownTool,
  getCheckins,
  getDataHealth,
  queryDaysTool,
];
