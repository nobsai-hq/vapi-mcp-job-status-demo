#!/usr/bin/env bash
# Smoke test against the deployed Worker (or pass your own URL)
U=${1:-https://vapi-mcp-job-status-demo.news-ce2.workers.dev}
post() { curl -s -X POST "$U$1" -H 'content-type: application/json' -d "$2"; echo; }
post /mcp '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}'
post /mcp '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
post /mcp '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_job_status","arguments":{"query":"J-1002"}}}'
post /mcp '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"create_work_order","arguments":{"po_number":"4471","description":"Add 2 camera drops"}}}'
post /vapi/tools '{"message":{"type":"tool-calls","toolCallList":[{"id":"call_1","name":"get_job_status","arguments":{"query":"sample clinic"}}]}}'
