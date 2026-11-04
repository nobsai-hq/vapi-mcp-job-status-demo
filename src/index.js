// Tiny MCP-style tool server for a Vapi voice agent.
// One read-only tool (get_job_status) on SAMPLE data, plus one write tool
// (create_work_order) that refuses to act unless the caller confirmed.
// Nothing is stored. The write tool only returns what it WOULD create.

const SAMPLE_JOBS = {
  "J-1001": { job: "J-1001", customer: "Sample Clinic", site: "100 Demo Ave", type: "Network cabling, 24 drops", status: "In progress", tech: "Tech A", next_step: "Patch panel install", eta: "2026-11-06" },
  "J-1002": { job: "J-1002", customer: "Sample Warehouse", site: "200 Test Blvd", type: "Security cameras, 8 units", status: "Waiting on parts", tech: "Tech B", next_step: "Cameras arrive from vendor", eta: "2026-11-10" },
  "J-1003": { job: "J-1003", customer: "Sample Apartments", site: "300 Example St", type: "FTTH drop", status: "Complete", tech: "Tech C", next_step: "Invoice sent", eta: null }
};

const TOOLS = [
  {
    name: "get_job_status",
    description: "Read-only. Look up the status of one job by job number (like J-1001) or customer name. Sample data only.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Job number or customer name" } }, required: ["query"] },
    annotations: { readOnlyHint: true }
  },
  {
    name: "create_work_order",
    description: "WRITE. Draft a work order. The agent MUST read the details back and get a clear yes from the caller first, then call again with confirmed=true. Without confirmed=true nothing happens. This demo never stores anything.",
    inputSchema: { type: "object", properties: { po_number: { type: "string" }, job: { type: "string" }, description: { type: "string" }, confirmed: { type: "boolean", description: "true only after the caller said yes to the read-back" } }, required: ["po_number", "description"] },
    annotations: { readOnlyHint: false, destructiveHint: false }
  }
];

function findJob(q) {
  const s = String(q || "").trim().toLowerCase();
  if (!s) return null;
  for (const j of Object.values(SAMPLE_JOBS)) {
    if (j.job.toLowerCase() === s || j.job.toLowerCase().replace("-", "") === s.replace(/[\s-]/g, "") || j.customer.toLowerCase().includes(s)) return j;
  }
  return null;
}

function runTool(name, args = {}) {
  if (name === "get_job_status") {
    const j = findJob(args.query);
    if (!j) return { found: false, message: `No sample job matches "${args.query}". Try J-1001, J-1002 or J-1003.` };
    return { found: true, ...j, say: `Job ${j.job} for ${j.customer} is ${j.status}. Next step: ${j.next_step}${j.eta ? `, expected ${j.eta}` : ""}.` };
  }
  if (name === "create_work_order") {
    const summary = `Work order for PO ${args.po_number || "(missing)"}${args.job ? ` on job ${args.job}` : ""}: ${args.description || "(missing)"}`;
    if (args.confirmed !== true) {
      return { created: false, needs_confirmation: true, read_back: summary, say: `Before I create anything: ${summary}. Should I go ahead?` };
    }
    return { created: false, would_create: summary, demo: true, say: `Confirmed. In the real setup this is where the work order gets created. This demo does not store anything.` };
  }
  throw new Error(`Unknown tool: ${name}`);
}

// MCP JSON-RPC 2.0 over HTTP (stateless, JSON responses)
function handleRpc(msg) {
  const { id, method, params } = msg || {};
  const ok = (result) => ({ jsonrpc: "2.0", id, result });
  const err = (code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
  switch (method) {
    case "initialize":
      return ok({ protocolVersion: params?.protocolVersion || "2025-03-26", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "job-status-demo", version: "0.1.0" } });
    case "notifications/initialized":
      return null;
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      try {
        const out = runTool(params?.name, params?.arguments || {});
        return ok({ content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out, isError: false });
      } catch (e) {
        return ok({ content: [{ type: "text", text: String(e.message) }], isError: true });
      }
    }
    default:
      return id === undefined ? null : err(-32601, `Method not found: ${method}`);
  }
}

// Vapi custom-tool webhook format: { message: { type: "tool-calls", toolCallList: [...] } }
function handleVapi(body) {
  const calls = body?.message?.toolCallList || body?.message?.toolCalls || [];
  const results = calls.map((c) => {
    const name = c.name || c.function?.name;
    let args = c.arguments ?? c.function?.arguments ?? {};
    if (typeof args === "string") { try { args = JSON.parse(args); } catch { args = {}; } }
    try { return { toolCallId: c.id, result: JSON.stringify(runTool(name, args)) }; }
    catch (e) { return { toolCallId: c.id, error: String(e.message) }; }
  });
  return { results };
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj, null, 2), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });

export default {
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" } });
    if (url.pathname === "/mcp" && req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body) return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
      if (Array.isArray(body)) { const out = body.map(handleRpc).filter(Boolean); return out.length ? json(out) : new Response(null, { status: 202 }); }
      const out = handleRpc(body);
      return out ? json(out) : new Response(null, { status: 202 });
    }
    if (url.pathname === "/vapi/tools" && req.method === "POST") return json(handleVapi(await req.json().catch(() => ({}))));
    if (url.pathname === "/") return json({ name: "job-status-demo", about: "MCP-style tool server for a Vapi voice agent. Sample data only. Read-only status lookup plus a confirm-before-write rule.", endpoints: { mcp: "POST /mcp (JSON-RPC: initialize, tools/list, tools/call)", vapi: "POST /vapi/tools (Vapi tool-calls webhook)" }, tools: TOOLS.map((t) => t.name), source: "github.com/369Apps/vapi-mcp-job-status-demo" });
    return json({ error: "not found" }, 404);
  }
};
