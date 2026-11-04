# Vapi + MCP job status demo

A small, public proof of how a Vapi voice agent can reach business tools through an MCP-style server, with a hard "ask before you write" rule.

Built by No BS AI as a demo. It uses **sample data only**. Nothing is stored and no real systems are touched.

## What's here

- `src/index.js`: a Cloudflare Worker that acts as the tool server.
  - `POST /mcp`: JSON-RPC 2.0 (MCP methods `initialize`, `tools/list`, `tools/call`), stateless, JSON responses.
  - `POST /vapi/tools`: the same tools in Vapi's custom tool webhook format (`toolCallList` in, `results` out).
- Two tools:
  - `get_job_status` (read-only): look up a job by number (J-1001, J-1002, J-1003) or customer name.
  - `create_work_order` (write): without `confirmed: true` it only returns a read-back and asks "Should I go ahead?". With it, the demo says what it *would* create and still stores nothing.
- `vapi-assistant.json`: assistant config (Claude model, system prompt with the confirm-first rule, MCP tool pointing at the Worker).
- `vapi-tools-webhook-alt.json`: the same two tools as plain Vapi function tools, if you prefer webhooks over MCP.
- `test.sh`: curl smoke test.

## Live endpoint

https://vapi-mcp-job-status-demo.news-ce2.workers.dev

## Status, honestly

- The Worker is deployed and the MCP and Vapi-webhook endpoints are tested with curl (`./test.sh`).
- The Vapi assistant config has **not** been loaded into a live Vapi account and called yet. That's the next step with a real Vapi key.

## How this maps to a real setup

Swap the sample data for real reads (Salesforce job/opportunity lookup, Outlook, Dropbox), keep every write behind the confirmed flag, and route each voice intent to the matching skill or agent. Add auth (a bearer token on the server URL) before any real data goes in.

## Deploy your own

```
npx wrangler deploy
./test.sh https://<your-worker>.workers.dev
```
