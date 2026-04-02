/**
 * USGS Water MCP — wraps USGS National Water Information System (NWIS) REST services (free, no auth)
 *
 * Tools:
 * - get_current: retrieve current instantaneous streamflow and gage height for a site
 * - search_sites: list active stream-gage sites in a US state
 * - get_daily: retrieve daily mean values for a site between two dates
 */

interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
}

const BASE_URL = 'https://waterservices.usgs.gov/nwis';

const tools: McpToolExport['tools'] = [
  {
    name: 'get_current',
    description:
      'Get current instantaneous streamflow (discharge, cfs) and gage height (ft) for a USGS monitoring site.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        site_id: {
          type: 'string',
          description: 'USGS site number (e.g., "01646500" for Potomac River at Little Falls, MD)',
        },
      },
      required: ['site_id'],
    },
  },
  {
    name: 'search_sites',
    description:
      'Find active USGS stream-gage sites in a US state that have real-time instantaneous data.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        state: {
          type: 'string',
          description: 'Two-letter US state abbreviation (e.g., "VA", "CA", "TX")',
        },
      },
      required: ['state'],
    },
  },
  {
    name: 'get_daily',
    description:
      'Get daily mean streamflow values for a USGS site over a date range. Dates must be in YYYY-MM-DD format.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        site_id: { type: 'string', description: 'USGS site number' },
        start: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
        end: { type: 'string', description: 'End date in YYYY-MM-DD format' },
      },
      required: ['site_id', 'start', 'end'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_current':
      return getCurrent(args.site_id as string);
    case 'search_sites':
      return searchSites(args.state as string);
    case 'get_daily':
      return getDaily(args.site_id as string, args.start as string, args.end as string);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

interface NwisTimeSeries {
  name?: string;
  variable?: { variableName?: { value?: string }; unit?: { unitCode?: string } };
  values?: { value?: { value?: string; dateTime?: string; qualifiers?: string[] }[] }[];
  sourceInfo?: { siteName?: string; siteCode?: { value?: string }[] };
}

interface NwisResponse {
  value?: { timeSeries?: NwisTimeSeries[] };
}

async function getCurrent(siteId: string) {
  const params = new URLSearchParams({
    format: 'json',
    sites: siteId,
    parameterCd: '00060,00065',
  });

  const res = await fetch(`${BASE_URL}/iv/?${params}`);
  if (!res.ok) throw new Error(`USGS NWIS error: ${res.status} ${res.statusText}`);

  const data = (await res.json()) as NwisResponse;
  const series = data.value?.timeSeries ?? [];

  if (series.length === 0) {
    return { site_id: siteId, site_name: null, readings: [] };
  }

  const siteName = series[0]?.sourceInfo?.siteName ?? null;

  const readings = series.map((ts) => {
    const latestValue = ts.values?.[0]?.value?.[0];
    return {
      parameter: ts.variable?.variableName?.value ?? ts.name ?? null,
      unit: ts.variable?.unit?.unitCode ?? null,
      value: latestValue?.value != null ? parseFloat(latestValue.value) : null,
      date_time: latestValue?.dateTime ?? null,
      qualifiers: latestValue?.qualifiers ?? [],
    };
  });

  return { site_id: siteId, site_name: siteName, readings };
}

async function searchSites(state: string) {
  const params = new URLSearchParams({
    format: 'json',
    stateCD: state.toUpperCase(),
    siteType: 'ST',
    hasDataTypeCd: 'iv',
  });

  const res = await fetch(`${BASE_URL}/site/?${params}`);
  if (!res.ok) throw new Error(`USGS NWIS error: ${res.status} ${res.statusText}`);

  const data = (await res.json()) as {
    value?: {
      sites?: {
        siteName?: string;
        siteCode?: { value?: string; network?: string }[];
        geoLocation?: {
          geogLocation?: { latitude?: number; longitude?: number };
          srs?: string;
        };
        hucCd?: string;
        drainageAreaCd?: string;
      }[];
    };
  };

  const sites = data.value?.sites ?? [];

  return {
    state: state.toUpperCase(),
    count: sites.length,
    sites: sites.map((s) => ({
      site_id: s.siteCode?.[0]?.value ?? null,
      site_name: s.siteName ?? null,
      latitude: s.geoLocation?.geogLocation?.latitude ?? null,
      longitude: s.geoLocation?.geogLocation?.longitude ?? null,
      huc: s.hucCd ?? null,
      drainage_area_sqmi: s.drainageAreaCd ? parseFloat(s.drainageAreaCd) : null,
    })),
  };
}

async function getDaily(siteId: string, start: string, end: string) {
  const params = new URLSearchParams({
    format: 'json',
    sites: siteId,
    startDT: start,
    endDT: end,
  });

  const res = await fetch(`${BASE_URL}/dv/?${params}`);
  if (!res.ok) throw new Error(`USGS NWIS error: ${res.status} ${res.statusText}`);

  const data = (await res.json()) as NwisResponse;
  const series = data.value?.timeSeries ?? [];

  if (series.length === 0) {
    return { site_id: siteId, start, end, series: [] };
  }

  const siteName = series[0]?.sourceInfo?.siteName ?? null;

  const result = series.map((ts) => ({
    parameter: ts.variable?.variableName?.value ?? null,
    unit: ts.variable?.unit?.unitCode ?? null,
    values: (ts.values?.[0]?.value ?? []).map((v) => ({
      date: v.dateTime ?? null,
      value: v.value != null ? parseFloat(v.value) : null,
      qualifiers: v.qualifiers ?? [],
    })),
  }));

  return { site_id: siteId, site_name: siteName, start, end, series: result };
}

export default { tools, callTool } satisfies McpToolExport;
