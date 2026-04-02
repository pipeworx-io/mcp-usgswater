# @pipeworx/mcp-usgswater

MCP server for USGS water and streamflow data

## Tools

| Tool | Description |
|------|-------------|
| `get_current` | Get current instantaneous streamflow and gage height for a USGS site |
| `search_sites` | Find active USGS stream-gage sites in a US state |
| `get_daily` | Get daily mean streamflow values for a site over a date range |

## Quickstart (Pipeworx Gateway)

```bash
curl -X POST https://gateway.pipeworx.io/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_current",
      "arguments": { "site_id": "01646500" }
    }
  }'
```

## License

MIT
