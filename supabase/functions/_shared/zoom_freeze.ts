export const DEFAULT_ZOOM_FREEZE_DATE = "2026-03-13";

function normalizeDateKey(value: string | null | undefined): string {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function normalizeMode(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

export function getZoomFreezeConfig() {
  const mode = normalizeMode("frozen");
  const freezeDate =
    normalizeDateKey(Deno.env.get("ZOOM_LEGACY_FREEZE_DATE"))
    || DEFAULT_ZOOM_FREEZE_DATE;

  return {
    mode,
    freezeDate,
    frozen: true,
  };
}

export function shouldFreezeZoom(dateKey?: string | null): boolean {
  const config = getZoomFreezeConfig();
  if (!config.frozen) return false;

  const normalizedDate = normalizeDateKey(dateKey || "");
  if (!normalizedDate) return true;
  return normalizedDate >= config.freezeDate;
}

export function buildZoomFreezeWarning(context: string, dateKey?: string | null): string {
  const config = getZoomFreezeConfig();
  const normalizedDate = normalizeDateKey(dateKey || "");
  const dateSuffix = normalizedDate
    ? ` Requested date ${normalizedDate} is on or after the freeze date ${config.freezeDate}.`
    : ` Freeze date: ${config.freezeDate}.`;

  return `${context}${dateSuffix} Historical Zoom rows are preserved; current attendance truth comes from HubSpot.`;
}

export function buildZoomFreezePayload(
  context: string,
  extra: Record<string, unknown> = {},
) {
  const config = getZoomFreezeConfig();

  return {
    ok: true,
    skipped: true,
    frozen: config.frozen,
    zoom_legacy_mode: config.mode,
    zoom_freeze_date: config.freezeDate,
    warning: buildZoomFreezeWarning(context),
    ...extra,
  };
}
