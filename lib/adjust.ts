const REPORTS_ENDPOINT = "https://automate.adjust.com/reports-service/report";

export const UTC_OFFSET = "+08:00";
export const TZ_NAME = "Asia/Singapore";

const APP_WHITELIST = [
  "[Drava] Photo AI: AI Image Generator",
  "[Drava] AI Photo Editor & Enhancer",
];

const BASE_DIMENSIONS = ["app", "channel", "campaign"] as const;

export const METRICS = [
  "installs",
  "network_cost",
  "ad_revenue",
  "revenue",
  "all_revenue",
  "ecpm",
  "roas_ad",
  "roas_ad_d3",
  "roas_ad_d7",
  "gross_profit",
  "cohort_ad_revenue",
  "arpdau_ad",
] as const;

export type Dimension = (typeof BASE_DIMENSIONS)[number] | "country";
export type Metric = (typeof METRICS)[number];

export type ReportRow = {
  app: string;
  channel: string;
  campaign: string;
  country?: string;
} & Partial<Record<Metric, number>>;

export type ReportParams = {
  startDate: string;
  endDate: string;
  appTokens?: string[];
  withCountry?: boolean;
};

export async function fetchReport(params: ReportParams): Promise<ReportRow[]> {
  const token = process.env.ADJUST_API_TOKEN;
  if (!token) {
    throw new Error("ADJUST_API_TOKEN is not configured on the server");
  }

  const dimensions = params.withCountry
    ? [...BASE_DIMENSIONS, "country"]
    : [...BASE_DIMENSIONS];

  const url = new URL(REPORTS_ENDPOINT);
  url.searchParams.set("date_period", `${params.startDate}:${params.endDate}`);
  url.searchParams.set("dimensions", dimensions.join(","));
  url.searchParams.set("metrics", METRICS.join(","));
  url.searchParams.set("utc_offset", UTC_OFFSET);
  if (params.appTokens && params.appTokens.length > 0) {
    url.searchParams.set("app_tokens", params.appTokens.join(","));
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Adjust API ${res.status}: ${body.slice(0, 500)}`);
  }

  const json = (await res.json()) as { rows?: Array<Record<string, unknown>> };
  const rows = json.rows ?? [];
  const allowed = new Set(APP_WHITELIST);
  return rows
    .filter((r) => allowed.has(String(r.app ?? "")))
    .map((r) => {
      const out: ReportRow = {
        app: String(r.app ?? ""),
        channel: String(r.channel ?? ""),
        campaign: String(r.campaign ?? r.campaign_name ?? ""),
      };
      if (params.withCountry) {
        out.country = String(r.country ?? "");
      }
      for (const m of METRICS) {
        const v = r[m];
        if (v !== undefined && v !== null && v !== "") {
          const n = Number(v);
          if (Number.isFinite(n)) out[m] = n;
        }
      }
      return out;
    });
}

export function configuredAppTokens(): string[] | undefined {
  const raw = process.env.ADJUST_APP_TOKENS;
  if (!raw) return undefined;
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : undefined;
}
