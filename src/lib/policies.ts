import "server-only";
import { prisma } from "./db";
import { fetchGov24 } from "./sources/gov24";
import { fetchKosaf } from "./sources/kosaf";
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
  },
};

export type SourceStatus = {
  source: Source;
  ok: boolean;
  isSample: boolean;
  fetchedAt: string | null; // 데이터 기준 시각
  count: number;
};

// 같은 시점에 여러 요청이 들어와도 API는 한 번만 부른다
const inflight = new Map<Source, Promise<{ policies: Policy[]; status: SourceStatus }>>();

async function loadSource(source: Source): Promise<{ policies: Policy[]; status: SourceStatus }> {
  const cfg = SOURCES[source];

  if (!cfg.hasKey()) {
    const policies = samplePolicies(source);
    return { policies, status: { source, ok: true, isSample: true, fetchedAt: new Date().toISOString(), count: policies.length } };
  }

  const cached = await prisma.sourceCache.findUnique({ where: { source } });
  const cachedPolicies = cached && !cached.isSample ? (JSON.parse(cached.data) as Policy[]) : null;
  if (cached && cachedPolicies && Date.now() - cached.fetchedAt.getTime() < cfg.ttl && (cfg.current?.(cachedPolicies) ?? true)) {
    const policies = cachedPolicies;
    return { policies, status: { source, ok: true, isSample: false, fetchedAt: cached.fetchedAt.toISOString(), count: policies.length } };
  }

  try {
    const policies = await cfg.fetch();
    const fetchedAt = new Date();
    await prisma.sourceCache.upsert({
      where: { source },
      create: { source, data: JSON.stringify(policies), fetchedAt, isSample: false },
      update: { data: JSON.stringify(policies), fetchedAt, isSample: false },
    });
    return { policies, status: { source, ok: true, isSample: false, fetchedAt: fetchedAt.toISOString(), count: policies.length } };
  } catch (err) {
    console.error(`[policies] ${source} 불러오기 실패:`, (err as Error).message);
    // 실패하면 오래된 캐시라도 보여준다. 그것도 없으면 이 출처만 비운다.
    if (cached && cachedPolicies) {
      const policies = cachedPolicies;
      return { policies, status: { source, ok: false, isSample: false, fetchedAt: cached.fetchedAt.toISOString(), count: policies.length } };
    }
    return { policies: [], status: { source, ok: false, isSample: false, fetchedAt: null, count: 0 } };
  }
}

function load(source: Source) {
  let p = inflight.get(source);
  if (!p) {
    p = loadSource(source).finally(() => inflight.delete(source));
    inflight.set(source, p);
  }
  return p;
}

const norm = (s: string) => s.replace(/[\s()[\]·\-_]/g, "").toLowerCase();

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

/** 정책명 + 기관명이 같으면 하나로 합친다. 온통청년 → 보조금24 → 장학재단 순으로 우선 */
export function dedupe(lists: Policy[][]): Policy[] {
  const seen = new Map<string, Policy>();
  for (const list of lists) {
    for (const p of list) {
      if (!p.title) continue;
      const key = `${norm(p.title)}|${norm(p.agency)}`;
      if (!seen.has(key)) seen.set(key, sanitizePolicy(p));
    }
  }
  return [...seen.values()];
}

/** 세 출처를 동시에 불러온다. 하나가 실패해도 나머지는 그대로 돌려준다. */
export async function getAllPolicies(): Promise<{ policies: Policy[]; sources: SourceStatus[] }> {
  const order: Source[] = ["youth", "gov24", "kosaf"];
  const settled = await Promise.allSettled(order.map(load));
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
  return { policies: dedupe(lists), sources };
}

export async function getPolicyById(id: string): Promise<Policy | null> {
  const { policies } = await getAllPolicies();
  return policies.find((p) => p.id === id) ?? null;
}
