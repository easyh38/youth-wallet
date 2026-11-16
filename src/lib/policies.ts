import "server-only";
import { gunzipSync, gzipSync } from "node:zlib";
import { after } from "next/server";
import { kstDate } from "./date";
import { dedupePolicies } from "./dedupe";
import { prisma } from "./db";
import { fetchGov24 } from "./sources/gov24";
import { fetchKosaf, kosafCacheCurrent } from "./sources/kosaf";
import { samplePolicies } from "./sources/sample";
import { isPublicFetchUrl, safeHttpUrl } from "./security";
import { fetchYouth } from "./sources/youth";
import type { Policy, Source } from "./types";

const HOUR = 3_600_000;

type SourceConfig = {
  ttl: number;
  hasKey: () => boolean;
  fetch: () => Promise<Policy[]>;
  /** 캐시가 지금 코드의 형식으로 저장됐는지. 아니면 만료 전이라도 다시 받는다 */
  current?: (cached: Policy[]) => boolean;
};

const SOURCES: Record<Source, SourceConfig> = {
  // 항목별 상세(details)가 없는 옛 형식 캐시는 다시 받는다
  youth: { ttl: 6 * HOUR, hasKey: () => !!process.env.YOUTH_API_KEY, fetch: fetchYouth, current: (c) => !c.length || !!c[0].details },
  gov24: { ttl: 6 * HOUR, hasKey: () => !!process.env.GOV24_API_KEY, fetch: fetchGov24 },
  kosaf: {
    ttl: 24 * HOUR,
    hasKey: () => !!process.env.KOSAF_API_KEY && !!process.env.KOSAF_API_URL,
    fetch: fetchKosaf,
    current: kosafCacheCurrent,
  },
};

export type SourceStatus = {
  source: Source;
  ok: boolean;
  isSample: boolean;
  fetchedAt: string | null; // 데이터 기준 시각
  count: number;
};

type Loaded = { policies: Policy[]; status: SourceStatus };

/** 실패한 출처는 이 시간 동안 다시 부르지 않는다 (느린 API를 요청마다 기다리지 않도록) */
const FAILURE_COOLDOWN = 10 * 60_000;
/** 메모리 캐시를 믿는 시간. 지나면 DB를 다시 확인한다 (다른 서버 인스턴스가 새로 받았을 수 있다) */
const MEMORY_CHECK = 60_000;

type Entry = { policies: Policy[]; fetchedAt: Date; current: boolean; checkedAt: number };
const memory = new Map<Source, Entry>();
const lastFailure = new Map<Source, number>();
// 같은 출처를 동시에 여러 번 받지 않는다
const refreshing = new Map<Source, Promise<Entry>>();

const coolingDown = (source: Source) => Date.now() - (lastFailure.get(source) ?? 0) < FAILURE_COOLDOWN;

/**
 * DB에는 gzip + base64로 줄여서 저장한다 (온통청년 기준 약 1/5).
 * DB와 거리가 멀면 큰 글자열을 읽는 데만 수십 초가 걸린다. 압축 전 형식(그냥 JSON)도 읽는다.
 */
const GZ = "gz:";
export function encodeCache(policies: Policy[]): string {
  return GZ + gzipSync(JSON.stringify(policies)).toString("base64");
}
export function decodeCache(data: string): Policy[] {
  const json = data.startsWith(GZ) ? gunzipSync(Buffer.from(data.slice(GZ.length), "base64")).toString("utf8") : data;
  return JSON.parse(json) as Policy[];
}

/** 공공 API에서 새로 받아 DB·메모리에 저장한다 */
function refresh(source: Source): Promise<Entry> {
  let p = refreshing.get(source);
  if (!p) {
    p = (async () => {
      const t0 = Date.now();
      try {
        const policies = await SOURCES[source].fetch();
        const fetchedAt = new Date();
        const data = encodeCache(policies);
        await prisma.sourceCache.upsert({
          where: { source },
          create: { source, data, fetchedAt, isSample: false },
          update: { data, fetchedAt, isSample: false },
        });
        const entry = { policies, fetchedAt, current: true, checkedAt: Date.now() };
        memory.set(source, entry);
        lastFailure.delete(source);
        console.log(`[policies] ${source} ${policies.length}건 새로 받음 (${Date.now() - t0}ms)`);
        return entry;
      } catch (err) {
        lastFailure.set(source, Date.now());
        console.error(`[policies] ${source} 불러오기 실패 (${Date.now() - t0}ms):`, (err as Error).message);
        throw err;
      }
    })().finally(() => refreshing.delete(source));
    refreshing.set(source, p);
  }
  return p;
}

/** 응답을 보낸 뒤 실행한다. 요청 밖(스케줄러 등)에서는 그냥 뒤에서 돌린다 */
function inBackground(task: () => Promise<unknown>) {
  const run = () => task().catch(() => {});
  try {
    after(run);
  } catch {
    void run();
  }
}

/** 메모리 → DB 순서로 저장된 데이터를 찾는다 */
async function readCache(source: Source): Promise<Entry | null> {
  const mem = memory.get(source);
  if (mem && Date.now() - mem.checkedAt < MEMORY_CHECK) return mem;
  const row = await prisma.sourceCache.findUnique({ where: { source }, select: { fetchedAt: true, isSample: true } });
  if (!row || row.isSample) return null;
  // DB가 메모리와 같은 시점이면 큰 데이터를 다시 읽지 않는다
  if (mem && mem.fetchedAt.getTime() === row.fetchedAt.getTime()) {
    mem.checkedAt = Date.now();
    return mem;
  }
  const full = await prisma.sourceCache.findUnique({ where: { source } });
  if (!full) return null;
  const policies = decodeCache(full.data);
  // 압축 전 형식으로 저장된 캐시는 압축해서 다시 저장해 둔다 (다음 읽기부터 빨라진다)
  if (!full.data.startsWith(GZ)) {
    inBackground(() => prisma.sourceCache.update({ where: { source }, data: { data: encodeCache(policies) } }));
  }
  const entry = { policies, fetchedAt: full.fetchedAt, current: SOURCES[source].current?.(policies) ?? true, checkedAt: Date.now() };
  memory.set(source, entry);
  return entry;
}

const toLoaded = (source: Source, e: Entry, ok = true): Loaded => ({
  policies: e.policies,
  status: { source, ok, isSample: false, fetchedAt: e.fetchedAt.toISOString(), count: e.policies.length },
});

/**
 * 저장된 데이터가 있으면 (오래됐더라도) 바로 돌려주고, 오래됐으면 응답 뒤에 새로 받는다.
 * 저장된 데이터가 전혀 없을 때만 공공 API를 기다린다.
 */
async function loadSource(source: Source): Promise<Loaded> {
  const cfg = SOURCES[source];
  if (!cfg.hasKey()) {
    const policies = samplePolicies(source);
    return { policies, status: { source, ok: true, isSample: true, fetchedAt: new Date().toISOString(), count: policies.length } };
  }

  const cached = await readCache(source);
  if (cached) {
    const stale = !cached.current || Date.now() - cached.fetchedAt.getTime() >= cfg.ttl;
    if (stale && !coolingDown(source)) inBackground(() => refresh(source));
    return toLoaded(source, cached);
  }

  if (coolingDown(source)) return { policies: [], status: { source, ok: false, isSample: false, fetchedAt: null, count: 0 } };
  try {
    return toLoaded(source, await refresh(source));
  } catch {
    return { policies: [], status: { source, ok: false, isSample: false, fetchedAt: null, count: 0 } };
  }
}

/** 스케줄러용: 오래된 출처를 미리 새로 받아 둔다 (첫 사용자가 오래된 데이터를 보지 않도록) */
export async function warmSources(): Promise<Record<Source, string>> {
  const out = {} as Record<Source, string>;
  await Promise.all(
    (Object.keys(SOURCES) as Source[]).map(async (source) => {
      const cfg = SOURCES[source];
      if (!cfg.hasKey()) return void (out[source] = "sample");
      const cached = await readCache(source);
      // 다음 스케줄 전에 만료되지 않도록 TTL의 절반이 지났으면 새로 받는다
      if (cached?.current && Date.now() - cached.fetchedAt.getTime() < cfg.ttl / 2) return void (out[source] = "fresh");
      try {
        out[source] = `refreshed ${(await refresh(source)).policies.length}`;
      } catch (err) {
        out[source] = `failed: ${(err as Error).message}`;
      }
    }),
  );
  return out;
}

const FALLBACK_URL: Record<Source, string> = {
  youth: "https://www.youthcenter.go.kr",
  gov24: "https://www.gov.kr",
  kosaf: "https://www.kosaf.go.kr",
};

/**
 * 외부 API 데이터는 믿지 않는다.
 * - 원문 링크는 http(s)만 (javascript: 링크로 인한 XSS 방지)
 * - 서버가 내려받을 첨부 주소는 공개 https만 (SSRF 방지)
 * - 지나치게 긴 문자열은 자른다
 */
export function sanitizePolicy(p: Policy): Policy {
  return {
    ...p,
    title: p.title.slice(0, 200),
    agency: p.agency.slice(0, 100),
    summaryRaw: p.summaryRaw.slice(0, 20_000),
    detailUrl: safeHttpUrl(p.detailUrl, FALLBACK_URL[p.source]),
    attachmentUrls: p.attachmentUrls.filter(isPublicFetchUrl).slice(0, 5),
    details: p.details?.slice(0, 30).map((d) => ({ label: d.label.slice(0, 30), value: d.value.slice(0, 4_000) })),
    keywords: p.keywords?.slice(0, 10).map((k) => k.slice(0, 30)),
    links: p.links
      ?.map((l) => ({ label: l.label.slice(0, 30), url: safeHttpUrl(l.url, "") }))
      .filter((l) => l.url)
      .slice(0, 5),
  };
}

let merged: { key: string; policies: Policy[]; aliases: Map<string, string> } | null = null;

/** 겹쳐서 합친 정책은 앞 출처(온통청년 → 보조금24 → 장학재단) 것을 남긴다. 기준은 dedupe.ts */
function mergeLists(lists: Policy[][]) {
  const { policies, aliases } = dedupePolicies(lists);
  return { policies: policies.map(sanitizePolicy), aliases };
}

/** 세 출처를 동시에 불러온다. 하나가 실패해도 나머지는 그대로 돌려준다. */
export async function getAllPolicies(): Promise<{ policies: Policy[]; sources: SourceStatus[] }> {
  const order: Source[] = ["youth", "gov24", "kosaf"];
  const settled = await Promise.allSettled(order.map(loadSource));
  const lists: Policy[][] = [];
  const sources: SourceStatus[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      lists.push(r.value.policies);
      sources.push(r.value.status);
    } else {
      lists.push([]);
      sources.push({ source: order[i], ok: false, isSample: false, fetchedAt: null, count: 0 });
    }
  });
  // 세 출처가 그대로면 합치기·정리(약 1.5만 건)를 다시 하지 않는다
  // 샘플 데이터는 오늘 날짜 기준으로 만들어지므로 날짜도 키에 넣는다
  const key = kstDate() + "|" + sources.map((s) => `${s.source}:${s.isSample ? "sample" : s.fetchedAt}:${s.count}`).join("|");
  if (merged?.key !== key) merged = { key, ...mergeLists(lists) };
  return { policies: merged.policies, sources };
}

export async function getPolicyById(id: string): Promise<Policy | null> {
  const { policies } = await getAllPolicies();
  // 다른 출처의 같은 정책과 합쳐진 ID로 들어와도 (예전에 저장·공유한 링크) 남은 정책을 보여준다
  const target = merged?.aliases.get(id) ?? id;
  return policies.find((p) => p.id === target) ?? null;
}
