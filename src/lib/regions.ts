// 법정동 코드 앞 5자리(시·군·구) 기준. 시·도는 앞 2자리.
// 학습용으로 주요 시·군·구를 담았다. 전체 목록은 행정표준코드관리시스템의 법정동코드 파일로 교체할 수 있다.

export type Sido = { code: string; name: string; sigungu: { code: string; name: string }[] };

const s = (code: string, names: string): { code: string; name: string }[] =>
  names.split(",").map((pair) => {
    const [c, n] = pair.split(":");
    return { code: code + c, name: n };
  });

export const REGIONS: Sido[] = [
  {
    code: "11",
    name: "서울특별시",
    sigungu: s(
      "11",
      "110:종로구,140:중구,170:용산구,200:성동구,215:광진구,230:동대문구,260:중랑구,290:성북구,305:강북구,320:도봉구,350:노원구,380:은평구,410:서대문구,440:마포구,470:양천구,500:강서구,530:구로구,545:금천구,560:영등포구,590:동작구,620:관악구,650:서초구,680:강남구,710:송파구,740:강동구",
    ),
  },
  {
    code: "26",
    name: "부산광역시",
    sigungu: s(
      "26",
      "110:중구,140:서구,170:동구,200:영도구,230:부산진구,260:동래구,290:남구,320:북구,350:해운대구,380:사하구,410:금정구,440:강서구,470:연제구,500:수영구,530:사상구,710:기장군",
    ),
  },
  {
    code: "27",
    name: "대구광역시",
    sigungu: s("27", "110:중구,140:동구,170:서구,200:남구,230:북구,260:수성구,290:달서구,710:달성군,720:군위군"),
  },
  {
    code: "28",
    name: "인천광역시",
    // 2026-07 행정체제 개편: 중구·동구 → 제물포구·영종구, 서구 → 서구·검단구 (옛 코드는 LEGACY_SIGUNGU)
    sigungu: s("28", "125:제물포구,155:영종구,177:미추홀구,185:연수구,200:남동구,237:부평구,245:계양구,275:서구,290:검단구,710:강화군,720:옹진군"),
  },
  { code: "29", name: "광주광역시", sigungu: s("29", "110:동구,140:서구,155:남구,170:북구,200:광산구") },
  { code: "30", name: "대전광역시", sigungu: s("30", "110:동구,140:중구,170:서구,200:유성구,230:대덕구") },
  { code: "31", name: "울산광역시", sigungu: s("31", "110:중구,140:남구,170:동구,200:북구,710:울주군") },
  { code: "36", name: "세종특별자치시", sigungu: [{ code: "36110", name: "세종시" }] },
  {
    code: "41",
    name: "경기도",
    sigungu: s(
      "41",
      "110:수원시,130:성남시,150:의정부시,170:안양시,190:부천시,210:광명시,220:평택시,250:동두천시,270:안산시,280:고양시,290:과천시,310:구리시,360:남양주시,370:오산시,390:시흥시,410:군포시,430:의왕시,450:하남시,460:용인시,480:파주시,500:이천시,550:안성시,570:김포시,590:화성시,610:광주시,630:양주시,650:포천시,670:여주시",
    ),
  },
  { code: "51", name: "강원특별자치도", sigungu: s("51", "110:춘천시,130:원주시,150:강릉시,170:동해시,190:태백시,210:속초시,230:삼척시") },
  { code: "43", name: "충청북도", sigungu: s("43", "110:청주시,130:충주시,150:제천시") },
  { code: "44", name: "충청남도", sigungu: s("44", "130:천안시,150:공주시,180:보령시,200:아산시,210:서산시,230:논산시,250:계룡시,270:당진시") },
  { code: "52", name: "전북특별자치도", sigungu: s("52", "110:전주시,130:군산시,140:익산시,180:정읍시,190:남원시,210:김제시") },
  { code: "46", name: "전라남도", sigungu: s("46", "110:목포시,130:여수시,150:순천시,170:나주시,230:광양시") },
  { code: "47", name: "경상북도", sigungu: s("47", "110:포항시,130:경주시,150:김천시,170:안동시,190:구미시,210:영주시,230:영천시,250:상주시,280:문경시,290:경산시") },
  { code: "48", name: "경상남도", sigungu: s("48", "120:창원시,170:진주시,220:통영시,240:사천시,250:김해시,270:밀양시,310:거제시,330:양산시") },
  { code: "50", name: "제주특별자치도", sigungu: s("50", "110:제주시,130:서귀포시") },
];

/**
 * 개편 전 시·군·구 코드 → 지금 코드. 예전에 저장한 프로필과 옛 코드로 오는 공고를 지금 표에 맞춘다.
 * 옛 인천 중구는 제물포구·영종구로 나뉘었으므로 두 곳 모두와 같게 본다.
 */
export const LEGACY_SIGUNGU: Record<string, { name: string; now: string[] }> = {
  "28110": { name: "중구", now: ["28125", "28155"] },
  "28140": { name: "동구", now: ["28125"] },
  "28260": { name: "서구", now: ["28275", "28290"] },
};

export function regionName(code: string): string {
  const sido = REGIONS.find((r) => r.code === code.slice(0, 2));
  const legacy = LEGACY_SIGUNGU[code];
  if (sido && legacy) return `${sido.name} ${legacy.name}`;
  if (!sido) return code;
  if (code.length === 2) return sido.name;
  // "41:연천군" — 지역 표에 없는 시·군·구 (regionsFromAgency 참고)
  if (code[2] === ":") return `${sido.name} ${code.slice(3)}`;
  const sg = sido.sigungu.find((g) => g.code === code);
  return sg ? `${sido.name} ${sg.name}` : sido.name;
}

/** 시·도 이름(약칭 포함) → 2자리 코드. 공고문 텍스트에서 지역을 뽑을 때 사용 */
export const SIDO_ALIASES: Record<string, string> = {
  서울: "11", 부산: "26", 대구: "27", 인천: "28", 광주광역시: "29", 대전: "30", 울산: "31", 세종: "36",
  경기: "41", 강원: "51", 충북: "43", 충청북도: "43", 충남: "44", 충청남도: "44", 전북: "52", 전라북도: "52",
  전남: "46", 전라남도: "46", 경북: "47", 경상북도: "47", 경남: "48", 경상남도: "48", 제주: "50",
};

/**
 * 지역 표(REGIONS)에 없는 시·군·구 이름. 사용자가 고를 수는 없지만, 공고의 대상 지역을 알아보는 데 쓴다.
 * (예: "횡성인재육성장학회" → 강원 횡성군 → 다른 지역 사용자에게서 제외)
 */
export const EXTRA_SIGUNGU: Record<string, string[]> = {
  "41": ["연천군", "가평군", "양평군"],
  "51": ["홍천군", "횡성군", "영월군", "평창군", "정선군", "철원군", "화천군", "양구군", "인제군", "고성군", "양양군"],
  "43": ["보은군", "옥천군", "영동군", "증평군", "진천군", "괴산군", "음성군", "단양군"],
  "44": ["금산군", "부여군", "서천군", "청양군", "홍성군", "예산군", "태안군"],
  "52": ["완주군", "진안군", "무주군", "장수군", "임실군", "순창군", "고창군", "부안군"],
  "46": ["담양군", "곡성군", "구례군", "고흥군", "보성군", "화순군", "장흥군", "강진군", "해남군", "영암군", "무안군", "함평군", "영광군", "장성군", "완도군", "진도군", "신안군"],
  "47": ["의성군", "청송군", "영양군", "영덕군", "청도군", "고령군", "성주군", "칠곡군", "예천군", "봉화군", "울진군", "울릉군"],
  "48": ["의령군", "함안군", "창녕군", "고성군", "남해군", "하동군", "산청군", "함양군", "거창군", "합천군"],
};

/**
 * 온통청년은 전남광주통합특별시 출범 뒤 옛 광주(29)·전남(46) 시·군·구를 12xxx 코드로 보낸다.
 * 사용자 프로필은 옛 코드를 쓰므로 옛 코드로 되돌린다. 표에 없는 전남 군은 "46:담양군" 형태로 둔다.
 */
const JEONNAM_GUN = ["담양군", "곡성군", "구례군", "고흥군", "보성군", "화순군", "장흥군", "강진군", "해남군", "영암군", "무안군", "함평군", "영광군", "장성군", "완도군", "진도군", "신안군"];
export const UNIFIED_12: Record<string, string> = {
  "12110": "46110", "12130": "46130", "12150": "46150", "12170": "46170", "12190": "46230", // 목포·여수·순천·나주·광양
  "12210": "29110", "12240": "29140", "12270": "29155", "12300": "29170", "12330": "29200", // 광주 동·서·남·북·광산구
  ...Object.fromEntries(JEONNAM_GUN.map((name, i) => [String(12710 + i * 10), `46:${name}`])),
};

const TABLE_CODES = new Set(REGIONS.flatMap((r) => r.sigungu.map((g) => g.code)));

/**
 * 공공 API의 시·군·구 코드를 지역 표 기준으로 맞춘다.
 * - 12xxx(전남광주) → 옛 광주·전남 코드
 * - 42/45(옛 강원·전북) → 51/52
 * - 일반구 코드(수원 장안구 41111, 창원 의창구 48121 …) → 시 코드(41110, 48120)
 * 표에 없는 코드는 그대로 둔다 (누구의 지역 코드와도 일치하지 않는다)
 */
export function normalizeSigunguCode(raw: string): string {
  if (/^\d{2}000$/.test(raw)) return normalizeSigunguCode(raw.slice(0, 2)); // "30000" = 대전 전체
  let code = UNIFIED_12[raw] ?? raw;
  if (LEGACY_SIGUNGU[code]) code = LEGACY_SIGUNGU[code].now[0];
  if (code.startsWith("42") || code.startsWith("45")) code = (code.startsWith("42") ? "51" : "52") + code.slice(2);
  if (/^\d{5}$/.test(code) && !TABLE_CODES.has(code)) {
    const city = code.slice(0, 4) + "0";
    if (TABLE_CODES.has(city)) return city;
  }
  return code;
}

/**
 * 시·도의 표에 있는 시·군·구를 모두 포함하면 그 시·도 코드 하나로, 모든 시·도를 덮으면 ["ALL"]로 줄인다.
 * (전국 대상 정책이 시·군·구 250여 개를 나열해 오는 경우가 많다)
 * 여러 시·도에 걸친 목록은 개편 직후 새 구 코드가 한두 개 빠져 오는 일이 많아(인천 영종구·서구 등)
 * 시·군·구가 8곳 이상인 시·도는 2곳까지 빠져도 그 시·도 전체로 본다.
 */
export function collapseRegionCodes(codes: string[]): string[] {
  const set = new Set(codes);
  const out: string[] = [];
  let whole = 0;
  const multiSido = new Set(codes.map((c) => c.slice(0, 2))).size >= 2;
  for (const r of REGIONS) {
    const mine = [...set].filter((c) => c.slice(0, 2) === r.code);
    const missing = r.sigungu.filter((g) => !set.has(g.code)).length;
    const covered = r.sigungu.length > 0 && (missing === 0 || (multiSido && r.sigungu.length >= 8 && missing <= 2));
    if (set.has(r.code) || covered) {
      out.push(r.code);
      whole++;
    } else out.push(...mine);
  }
  if (whole === REGIONS.length) return ["ALL"];
  // 표에 없는 시·도 코드도 버리지 않는다
  out.push(...[...set].filter((c) => !REGIONS.some((r) => r.code === c.slice(0, 2))));
  return out;
}

/** 화면 표시용: "전국", "서울특별시", "경기도 수원시, 경기도 성남시 외 3곳" */
export function regionLabel(codes: string[], max = 4): string {
  if (codes.includes("ALL")) return "전국";
  if (!codes.length) return "공고문 확인 필요";
  const names = [...new Set(codes.map(regionName))];
  return names.length > max ? `${names.slice(0, max).join(", ")} 외 ${names.length - max}곳` : names.join(", ");
}

/** 시·도의 모든 시·군·구. 표에 없는 곳은 "51:횡성군" 형태의 코드 (누구의 지역 코드와도 일치하지 않는다) */
export function allSigungu(sidoCode: string): { code: string; name: string }[] {
  const table = REGIONS.find((r) => r.code === sidoCode)?.sigungu ?? [];
  const extra = (EXTRA_SIGUNGU[sidoCode] ?? []).map((name) => ({ code: `${sidoCode}:${name}`, name }));
  return [...table, ...extra];
}
