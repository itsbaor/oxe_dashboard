"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Row = {
  app: string;
  channel: string;
  campaign: string;
  country?: string;
  installs?: number;
  network_cost?: number;
  ad_revenue?: number;
  revenue?: number;
  all_revenue?: number;
  ecpm?: number;
  roas_ad?: number;
  roas_ad_d3?: number;
  roas_ad_d7?: number;
  gross_profit?: number;
  cohort_ad_revenue?: number;
  arpdau_ad?: number;
};

type ReportResponse = {
  rows: Row[];
  startDate: string;
  endDate: string;
  fetchedAt: string;
};

type ColKind = "int" | "money" | "money4" | "vnd" | "percent" | "decimal";

const USD_TO_VND = Number(process.env.NEXT_PUBLIC_USD_TO_VND ?? "25000") || 25000;
type NumericKey =
  | "installs"
  | "network_cost"
  | "ad_revenue"
  | "revenue"
  | "all_revenue"
  | "ecpm"
  | "roas_ad"
  | "roas_ad_d3"
  | "roas_ad_d7"
  | "gross_profit"
  | "arpdau_ad";
type ColKey = NumericKey | "ltv" | "cpi";
type Col = { key: ColKey; label: string; kind: ColKind; tone?: "profit" | "roas" };

const NUMERIC_COLS: Col[] = [
  { key: "installs", label: "Installs", kind: "int" },
  { key: "network_cost", label: "Ad spend", kind: "money" },
  { key: "cpi", label: "CPI (₫)", kind: "vnd" },
  { key: "ad_revenue", label: "Ad rev", kind: "money" },
  { key: "revenue", label: "IAP rev", kind: "money" },
  { key: "all_revenue", label: "All rev", kind: "money" },
  { key: "roas_ad", label: "ROAS", kind: "percent", tone: "roas" },
  { key: "roas_ad_d3", label: "D3 ROAS", kind: "percent", tone: "roas" },
  { key: "roas_ad_d7", label: "D7 ROAS", kind: "percent", tone: "roas" },
  { key: "gross_profit", label: "Profit", kind: "money", tone: "profit" },
  { key: "ltv", label: "LTV / user", kind: "money" },
  { key: "ecpm", label: "eCPM", kind: "money" },
  { key: "arpdau_ad", label: "ARPDAU", kind: "decimal" },
];

function getValue(r: Row, key: ColKey): number | undefined {
  if (key === "ltv") {
    const rev = r.cohort_ad_revenue;
    const inst = r.installs;
    if (typeof rev === "number" && typeof inst === "number" && inst > 0) {
      return rev / inst;
    }
    return undefined;
  }
  if (key === "cpi") {
    const cost = r.network_cost;
    const inst = r.installs;
    if (typeof cost === "number" && typeof inst === "number" && inst > 0) {
      return cost / inst;
    }
    return undefined;
  }
  return r[key];
}

function fmt(value: number | undefined, kind: ColKind): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  if (kind === "int") return Math.round(value).toLocaleString();
  if (kind === "money") {
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    return `${sign}$${abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (kind === "money4") {
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    return `${sign}$${abs.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
  }
  if (kind === "vnd") {
    const vnd = value * USD_TO_VND;
    return `${Math.round(vnd).toLocaleString("vi-VN")} ₫`;
  }
  if (kind === "percent") return `${(value * 100).toFixed(2)}%`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function fmtCompact(value: number | undefined, kind: ColKind): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  if (kind === "int") {
    if (Math.abs(value) >= 1000) {
      return value.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 });
    }
    return Math.round(value).toLocaleString();
  }
  if (kind === "money") {
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    if (abs >= 1000) {
      return `${sign}$${abs.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 })}`;
    }
    return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  return fmt(value, kind);
}

function roasTone(v: number | undefined): string {
  if (v === undefined) return "text-neutral-400";
  if (v >= 1) return "text-emerald-400";
  if (v >= 0.7) return "text-amber-300";
  if (v >= 0.4) return "text-orange-400";
  return "text-rose-400";
}

function profitTone(v: number | undefined): string {
  if (v === undefined) return "text-neutral-400";
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-rose-400";
  return "text-neutral-300";
}

const TZ_OFFSET_HOURS = 8;
const TZ_LABEL = "UTC+08:00";
const TZ_NAME = "Asia/Singapore";

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(days: number): Date {
  const nowShifted = new Date(Date.now() + TZ_OFFSET_HOURS * 60 * 60 * 1000);
  nowShifted.setUTCHours(0, 0, 0, 0);
  nowShifted.setUTCDate(nowShifted.getUTCDate() - days);
  return nowShifted;
}

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: TZ_NAME,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

type PresetKey = "today" | "yesterday" | "last7" | "last14" | "last30" | "mtd" | "lastMonth" | "custom";

function presetRange(key: PresetKey): { start: string; end: string } {
  const today = daysAgo(0);
  const yesterday = daysAgo(1);
  if (key === "today") return { start: toIso(today), end: toIso(today) };
  if (key === "yesterday") return { start: toIso(yesterday), end: toIso(yesterday) };
  if (key === "last7") return { start: toIso(daysAgo(7)), end: toIso(yesterday) };
  if (key === "last14") return { start: toIso(daysAgo(14)), end: toIso(yesterday) };
  if (key === "last30") return { start: toIso(daysAgo(30)), end: toIso(yesterday) };
  if (key === "mtd") {
    const now = new Date();
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { start: toIso(first), end: toIso(yesterday) };
  }
  if (key === "lastMonth") {
    const now = new Date();
    const firstThis = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const lastPrev = new Date(firstThis.getTime() - 24 * 60 * 60 * 1000);
    const firstPrev = new Date(Date.UTC(lastPrev.getUTCFullYear(), lastPrev.getUTCMonth(), 1));
    return { start: toIso(firstPrev), end: toIso(lastPrev) };
  }
  return { start: toIso(daysAgo(7)), end: toIso(yesterday) };
}

const PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 days" },
  { key: "last14", label: "Last 14 days" },
  { key: "last30", label: "Last 30 days" },
  { key: "mtd", label: "Month to date" },
  { key: "lastMonth", label: "Last month" },
];

type SortKey = "app" | "channel" | "country" | "campaign" | ColKey;
type SortDir = "asc" | "desc";

export default function DashboardClient() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [activePreset, setActivePreset] = useState<PresetKey>("last7");

  const [rows, setRows] = useState<Row[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [appFilter, setAppFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [byCountry, setByCountry] = useState<boolean>(false);
  const [search, setSearch] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("network_cost");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(
    async (s: string, e: string, bc: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/report?start=${s}&end=${e}${bc ? "&country=1" : ""}`, { cache: "no-store" });
        const json = (await res.json()) as ReportResponse | { error: string };
        if (!res.ok || "error" in json) {
          setError("error" in json ? json.error : `HTTP ${res.status}`);
          setRows([]);
        } else {
          setRows(json.rows);
          setFetchedAt(json.fetchedAt);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "fetch failed");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const r = presetRange("last7");
    setStart(r.start);
    setEnd(r.end);
    load(r.start, r.end, byCountry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPreset(key: PresetKey) {
    const r = presetRange(key);
    setStart(r.start);
    setEnd(r.end);
    setActivePreset(key);
    load(r.start, r.end, byCountry);
  }

  function toggleByCountry() {
    const next = !byCountry;
    setByCountry(next);
    if (!next) setCountryFilter("all");
    load(start, end, next);
  }

  function onDateChange(which: "start" | "end", value: string) {
    if (which === "start") setStart(value);
    else setEnd(value);
    setActivePreset("custom");
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(
        key === "app" || key === "channel" || key === "country" || key === "campaign"
          ? "asc"
          : "desc",
      );
    }
  }

  const apps = useMemo(
    () => Array.from(new Set(rows.map((r) => r.app))).filter(Boolean).sort(),
    [rows],
  );
  const channels = useMemo(
    () => Array.from(new Set(rows.map((r) => r.channel))).filter(Boolean).sort(),
    [rows],
  );
  const countries = useMemo(
    () => Array.from(new Set(rows.map((r) => r.country ?? ""))).filter(Boolean).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (appFilter !== "all" && r.app !== appFilter) return false;
      if (channelFilter !== "all" && r.channel !== channelFilter) return false;
      if (byCountry && countryFilter !== "all" && r.country !== countryFilter) return false;
      if (q && !`${r.app} ${r.channel} ${r.country ?? ""} ${r.campaign}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, appFilter, channelFilter, countryFilter, byCountry, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av: number | string | undefined;
      let bv: number | string | undefined;
      if (sortKey === "app" || sortKey === "channel" || sortKey === "country" || sortKey === "campaign") {
        av = a[sortKey] ?? "";
        bv = b[sortKey] ?? "";
      } else {
        av = getValue(a, sortKey);
        bv = getValue(b, sortKey);
      }
      if (av === undefined && bv === undefined) return 0;
      if (av === undefined) return 1;
      if (bv === undefined) return -1;
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totals = useMemo(() => computeTotals(filtered), [filtered]);
  const stringColCount = byCountry ? 4 : 3;
  const perApp = useMemo(() => {
    const groups = new Map<string, Row[]>();
    for (const r of filtered) {
      const list = groups.get(r.app) ?? [];
      list.push(r);
      groups.set(r.app, list);
    }
    return Array.from(groups.entries())
      .map(([app, rs]) => ({ app, ...computeTotals(rs) }))
      .sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0));
  }, [filtered]);

  return (
    <main className="min-h-screen">
      <div className="border-b border-neutral-900 bg-neutral-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-3 sm:py-4 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-8 w-8 shrink-0 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-semibold leading-tight">UA Performance Dashboard</h1>
                <span className="rounded-md border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 text-[10px] text-neutral-400">
                  {TZ_LABEL}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-neutral-500 truncate">
                {fetchedAt
                  ? `Updated ${formatTs(fetchedAt)} · ${start} → ${end}`
                  : "Loading…"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[10px] uppercase tracking-wider text-neutral-500 flex flex-col flex-1 sm:flex-none min-w-[130px]">
              From
              <input
                type="date"
                value={start}
                max={end}
                onChange={(e) => onDateChange("start", e.target.value)}
                className="mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-2 py-2 text-sm focus:border-neutral-600 outline-none w-full"
              />
            </label>
            <label className="text-[10px] uppercase tracking-wider text-neutral-500 flex flex-col flex-1 sm:flex-none min-w-[130px]">
              To
              <input
                type="date"
                value={end}
                min={start}
                onChange={(e) => onDateChange("end", e.target.value)}
                className="mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-2 py-2 text-sm focus:border-neutral-600 outline-none w-full"
              />
            </label>
            <button
              onClick={() => load(start, end, byCountry)}
              disabled={loading}
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-50"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 pb-3">
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => applyPreset(p.key)}
                className={
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition " +
                  (activePreset === p.key
                    ? "bg-white text-neutral-900"
                    : "bg-neutral-900 text-neutral-300 hover:bg-neutral-800 border border-neutral-800")
                }
              >
                {p.label}
              </button>
            ))}
            {activePreset === "custom" ? (
              <span className="shrink-0 rounded-full px-3 py-1.5 text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Custom
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {error ? (
          <div className="rounded-md border border-rose-900 bg-rose-950/40 p-3 text-sm text-rose-300">
            {error}
          </div>
        ) : null}

        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          <KpiCard label="Installs" value={fmtCompact(totals.installs, "int")} loading={loading} />
          <KpiCard label="Ad spend" value={fmtCompact(totals.spend, "money")} loading={loading} />
          <KpiCard
            label="All revenue"
            value={fmtCompact(totals.allRev, "money")}
            sub={
              totals.adRev !== undefined || totals.iapRev !== undefined
                ? `${fmtCompact(totals.adRev, "money")} ad · ${fmtCompact(totals.iapRev, "money")} IAP`
                : undefined
            }
            loading={loading}
          />
          <KpiCard
            label="ROAS (ad)"
            value={totals.roas !== undefined ? `${(totals.roas * 100).toFixed(1)}%` : "—"}
            valueClass={roasTone(totals.roas)}
            loading={loading}
          />
          <KpiCard
            label="Profit"
            value={fmtCompact(totals.profit, "money")}
            valueClass={profitTone(totals.profit)}
            loading={loading}
          />
          <KpiCard
            label="LTV / user"
            value={totals.ltv !== undefined ? `$${totals.ltv.toFixed(2)}` : "—"}
            loading={loading}
          />
        </section>

        {perApp.length > 0 ? (
          <section>
            <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-2">By app</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
              {perApp.map((a) => (
                <div
                  key={a.app}
                  className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3 sm:p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate text-sm sm:text-base" title={a.app}>{a.app}</div>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        {a.installs?.toLocaleString() ?? "0"} installs
                      </div>
                    </div>
                    <div className={"text-xl sm:text-2xl font-semibold tabular-nums shrink-0 " + roasTone(a.roas)}>
                      {a.roas !== undefined ? `${(a.roas * 100).toFixed(1)}%` : "—"}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
                    <Mini label="Spend" value={fmtCompact(a.spend, "money")} />
                    <Mini label="Ad rev" value={fmtCompact(a.adRev, "money")} />
                    <Mini label="IAP rev" value={fmtCompact(a.iapRev, "money")} />
                    <Mini label="All rev" value={fmtCompact(a.allRev, "money")} />
                  </div>
                  <div className="mt-2 text-xs">
                    <Mini label="Profit" value={fmtCompact(a.profit, "money")} className={profitTone(a.profit)} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-2">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-2">
            <label className="text-[10px] uppercase tracking-wider text-neutral-500 flex flex-col col-span-2 sm:col-auto">
              App
              <select
                value={appFilter}
                onChange={(e) => setAppFilter(e.target.value)}
                className="mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-2 py-2 text-sm w-full sm:min-w-[200px]"
              >
                <option value="all">All apps</option>
                {apps.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </label>
            <label className="text-[10px] uppercase tracking-wider text-neutral-500 flex flex-col">
              Channel
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-2 py-2 text-sm w-full sm:min-w-[160px]"
              >
                <option value="all">All channels</option>
                {channels.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            {byCountry ? (
              <label className="text-[10px] uppercase tracking-wider text-neutral-500 flex flex-col">
                Country
                <select
                  value={countryFilter}
                  onChange={(e) => setCountryFilter(e.target.value)}
                  className="mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-2 py-2 text-sm w-full sm:min-w-[160px]"
                >
                  <option value="all">All countries ({countries.length})</option>
                  {countries.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">Breakdown</span>
              <button
                onClick={toggleByCountry}
                disabled={loading}
                aria-pressed={byCountry}
                className={
                  "mt-1 rounded-md px-3 py-2 text-sm border transition disabled:opacity-50 " +
                  (byCountry
                    ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-200 hover:bg-indigo-500/30"
                    : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700")
                }
                title={byCountry ? "Click to hide country breakdown" : "Click to split rows by country (refetches)"}
              >
                <span className="inline-flex items-center gap-2">
                  <span className={"h-3 w-3 rounded-sm border " + (byCountry ? "bg-indigo-400 border-indigo-300" : "border-neutral-600")}>
                    {byCountry ? <span className="block text-[10px] leading-3 text-neutral-900 text-center">✓</span> : null}
                  </span>
                  By country
                </span>
              </button>
            </div>
            <label className="text-[10px] uppercase tracking-wider text-neutral-500 flex flex-col col-span-2 sm:flex-1 sm:min-w-[240px]">
              Search campaign
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="campaign name…"
                className="mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-2 py-2 text-sm w-full"
              />
            </label>
            <div className="text-xs text-neutral-500 self-end pb-2 col-span-2 sm:col-auto sm:ml-auto">
              <span className="text-neutral-300 font-medium">{sorted.length}</span>
              <span className="text-neutral-500"> of {rows.length} campaigns</span>
            </div>
          </div>

          <div className="rounded-xl border border-neutral-800 overflow-hidden">
            <div className="overflow-auto max-h-[65vh] sm:max-h-[70vh]">
              <table className="min-w-full text-xs sm:text-sm">
                <thead className="bg-neutral-900 text-neutral-400 text-left sticky top-0 z-10">
                  <tr>
                    <Th label="App" sortKey="app" current={sortKey} dir={sortDir} onClick={toggleSort} />
                    <Th label="Channel" sortKey="channel" current={sortKey} dir={sortDir} onClick={toggleSort} />
                    {byCountry ? (
                      <Th label="Country" sortKey="country" current={sortKey} dir={sortDir} onClick={toggleSort} />
                    ) : null}
                    <Th label="Campaign" sortKey="campaign" current={sortKey} dir={sortDir} onClick={toggleSort} />
                    {NUMERIC_COLS.map((c) => (
                      <Th
                        key={c.key}
                        label={c.label}
                        sortKey={c.key}
                        current={sortKey}
                        dir={sortDir}
                        onClick={toggleSort}
                        align="right"
                      />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && rows.length === 0
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i} className="border-t border-neutral-900">
                          {Array.from({ length: stringColCount + NUMERIC_COLS.length }).map((_, j) => (
                            <td key={j} className="px-3 py-2">
                              <div className="h-3 rounded bg-neutral-900 animate-pulse" />
                            </td>
                          ))}
                        </tr>
                      ))
                    : sorted.map((r, i) => (
                        <tr key={i} className="border-t border-neutral-900 hover:bg-neutral-900/40">
                          <td className="px-3 py-1.5 whitespace-nowrap text-neutral-200">{r.app || "—"}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap text-neutral-300">{r.channel || "—"}</td>
                          {byCountry ? (
                            <td className="px-3 py-1.5 whitespace-nowrap text-neutral-300">{r.country || "—"}</td>
                          ) : null}
                          <td className="px-3 py-1.5 whitespace-nowrap text-neutral-400 max-w-[360px] truncate" title={r.campaign}>
                            {r.campaign || "—"}
                          </td>
                          {NUMERIC_COLS.map((c) => {
                            const v = getValue(r, c.key);
                            let cls = "text-neutral-200";
                            if (c.tone === "roas") cls = roasTone(v);
                            else if (c.tone === "profit") cls = profitTone(v);
                            return (
                              <td
                                key={c.key}
                                className={"px-3 py-1.5 text-right tabular-nums whitespace-nowrap " + cls}
                              >
                                {fmt(v, c.kind)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  {!loading && sorted.length === 0 ? (
                    <tr>
                      <td colSpan={stringColCount + NUMERIC_COLS.length} className="px-3 py-12 text-center text-neutral-500">
                        No campaigns match the current filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                {sorted.length > 0 ? (
                  <tfoot className="bg-neutral-900/80 font-medium sticky bottom-0">
                    <tr className="border-t border-neutral-800">
                      <td className="px-3 py-2 text-neutral-300" colSpan={stringColCount}>Total</td>
                      {NUMERIC_COLS.map((c) => {
                        let v: number | undefined;
                        if (c.key === "ltv") v = totals.ltv;
                        else if (c.key === "cpi") v = totals.cpi;
                        else if (c.key === "roas_ad") v = totals.roas;
                        else if (c.kind === "percent") v = undefined;
                        else if (c.key === "network_cost") v = totals.spend;
                        else if (c.key === "ad_revenue") v = totals.adRev;
                        else if (c.key === "revenue") v = totals.iapRev;
                        else if (c.key === "all_revenue") v = totals.allRev;
                        else if (c.key === "gross_profit") v = totals.profit;
                        else if (c.key === "installs") v = totals.installs;
                        else if (c.key === "ecpm") v = undefined;
                        else v = undefined;
                        let cls = "text-neutral-200";
                        if (c.tone === "roas") cls = roasTone(v);
                        else if (c.tone === "profit") cls = profitTone(v);
                        return (
                          <td
                            key={c.key}
                            className={"px-3 py-2 text-right tabular-nums whitespace-nowrap " + cls}
                          >
                            {v === undefined ? "—" : fmt(v, c.kind)}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function computeTotals(rs: Row[]) {
  let installs = 0;
  let spend = 0;
  let adRev = 0;
  let iapRev = 0;
  let allRev = 0;
  let profit = 0;
  let cohortRev = 0;
  let hasInstalls = false;
  let hasSpend = false;
  let hasAd = false;
  let hasIap = false;
  let hasAll = false;
  let hasProfit = false;
  let hasCohort = false;
  for (const r of rs) {
    if (typeof r.installs === "number") { installs += r.installs; hasInstalls = true; }
    if (typeof r.network_cost === "number") { spend += r.network_cost; hasSpend = true; }
    if (typeof r.ad_revenue === "number") { adRev += r.ad_revenue; hasAd = true; }
    if (typeof r.revenue === "number") { iapRev += r.revenue; hasIap = true; }
    if (typeof r.all_revenue === "number") { allRev += r.all_revenue; hasAll = true; }
    if (typeof r.gross_profit === "number") { profit += r.gross_profit; hasProfit = true; }
    if (typeof r.cohort_ad_revenue === "number") { cohortRev += r.cohort_ad_revenue; hasCohort = true; }
  }
  return {
    installs: hasInstalls ? installs : undefined,
    spend: hasSpend ? spend : undefined,
    adRev: hasAd ? adRev : undefined,
    iapRev: hasIap ? iapRev : undefined,
    allRev: hasAll ? allRev : undefined,
    profit: hasProfit ? profit : undefined,
    roas: hasSpend && spend > 0 && hasAd ? adRev / spend : undefined,
    ltv: hasCohort && hasInstalls && installs > 0 ? cohortRev / installs : undefined,
    cpi: hasSpend && hasInstalls && installs > 0 ? spend / installs : undefined,
  };
}

function KpiCard({
  label,
  value,
  sub,
  valueClass,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 sm:px-4 py-2.5 sm:py-3 min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 truncate">{label}</div>
      {loading ? (
        <div className="mt-2 h-7 w-20 rounded bg-neutral-800 animate-pulse" />
      ) : (
        <>
          <div className={"mt-1 text-xl sm:text-2xl font-semibold tabular-nums truncate " + (valueClass ?? "text-neutral-100")}>
            {value}
          </div>
          {sub ? <div className="mt-0.5 text-[11px] text-neutral-500 truncate" title={sub}>{sub}</div> : null}
        </>
      )}
    </div>
  );
}

function Mini({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</div>
      <div className={"mt-0.5 font-medium tabular-nums " + (className ?? "text-neutral-200")}>{value}</div>
    </div>
  );
}

function Th({
  label,
  sortKey,
  current,
  dir,
  onClick,
  align,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
  align?: "right";
}) {
  const active = current === sortKey;
  return (
    <th
      className={
        "px-3 py-2 font-medium select-none cursor-pointer whitespace-nowrap " +
        (align === "right" ? "text-right" : "text-left") +
        (active ? " text-neutral-100" : " hover:text-neutral-200")
      }
      onClick={() => onClick(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={"text-[10px] " + (active ? "opacity-100" : "opacity-30")}>
          {active ? (dir === "asc" ? "▲" : "▼") : "▾"}
        </span>
      </span>
    </th>
  );
}
