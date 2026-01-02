// src/utils/bankHolidays.ts

type GovUkBankHolidayEvent = { title: string; date: string; notes?: string; bunting?: boolean };
type GovUkBankHolidaysResponse = Record<
  string,
  { division: string; events: GovUkBankHolidayEvent[] }
>;

const STORAGE_KEY = "govuk-bank-holidays-cache-v1";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

type Cached = {
  cachedAt: number;
  data: GovUkBankHolidaysResponse;
};

function safeParse(json: string | null): Cached | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Cached;
  } catch {
    return null;
  }
}

async function fetchGovUkBankHolidays(): Promise<GovUkBankHolidaysResponse> {
  const res = await fetch("https://www.gov.uk/bank-holidays.json", { method: "GET" });
  if (!res.ok) throw new Error(`Failed to fetch bank holidays: ${res.status}`);
  return (await res.json()) as GovUkBankHolidaysResponse;
}

/**
 * Returns a Set of ISO date strings (YYYY-MM-DD) for bank holidays
 * in the given window, using Gov.uk feed.
 *
 * Division defaults to "england-and-wales".
 * Other valid keys include "scotland" and "northern-ireland".
 */
export async function getUkBankHolidaySet(
  start: Date,
  end: Date,
  division: "england-and-wales" | "scotland" | "northern-ireland" = "england-and-wales"
): Promise<Set<string>> {
  const now = Date.now();
  const cached = safeParse(localStorage.getItem(STORAGE_KEY));

  let data: GovUkBankHolidaysResponse | null = null;

  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    data = cached.data;
  } else {
    data = await fetchGovUkBankHolidays();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ cachedAt: now, data } satisfies Cached)
    );
  }

  const divisionBlock = data?.[division];
  const out = new Set<string>();
  if (!divisionBlock?.events?.length) return out;

  const startIso = start.toISOString().slice(0, 10);
  const endIso = end.toISOString().slice(0, 10);

  for (const ev of divisionBlock.events) {
    if (ev.date >= startIso && ev.date <= endIso) out.add(ev.date);
  }

  return out;
}
