function toFiniteNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeNumber(value, fallback) {
  const parsed = toFiniteNumberOrNull(value);
  return parsed === null ? fallback : parsed;
}

export const LEADS_EXPERIMENT_RUBRIC_VERSION = '2026-03-08.v1';

export const DEFAULT_LEADS_EXPERIMENT_RUBRIC = Object.freeze({
  quality: Object.freeze({
    qualifiedKeepFloor: 0.26,
    greatKeepFloor: 0.07,
    qualifiedKillFloor: 0.14,
    greatKillFloor: 0.03,
  }),
  efficiency: Object.freeze({
    cpqlGood: 900,
    cpqlPoor: 1800,
    cpglGood: 2800,
    cpglPoor: 5200,
  }),
});

export function resolveLeadsExperimentRubric(rubricOverride = {}) {
  const qualityOverride = rubricOverride?.quality || {};
  const efficiencyOverride = rubricOverride?.efficiency || {};

  const rubric = {
    quality: {
      qualifiedKeepFloor: normalizeNumber(
        qualityOverride.qualifiedKeepFloor,
        DEFAULT_LEADS_EXPERIMENT_RUBRIC.quality.qualifiedKeepFloor,
      ),
      greatKeepFloor: normalizeNumber(
        qualityOverride.greatKeepFloor,
        DEFAULT_LEADS_EXPERIMENT_RUBRIC.quality.greatKeepFloor,
      ),
      qualifiedKillFloor: normalizeNumber(
        qualityOverride.qualifiedKillFloor,
        DEFAULT_LEADS_EXPERIMENT_RUBRIC.quality.qualifiedKillFloor,
      ),
      greatKillFloor: normalizeNumber(
        qualityOverride.greatKillFloor,
        DEFAULT_LEADS_EXPERIMENT_RUBRIC.quality.greatKillFloor,
      ),
    },
    efficiency: {
      cpqlGood: normalizeNumber(
        efficiencyOverride.cpqlGood,
        DEFAULT_LEADS_EXPERIMENT_RUBRIC.efficiency.cpqlGood,
      ),
      cpqlPoor: normalizeNumber(
        efficiencyOverride.cpqlPoor,
        DEFAULT_LEADS_EXPERIMENT_RUBRIC.efficiency.cpqlPoor,
      ),
      cpglGood: normalizeNumber(
        efficiencyOverride.cpglGood,
        DEFAULT_LEADS_EXPERIMENT_RUBRIC.efficiency.cpglGood,
      ),
      cpglPoor: normalizeNumber(
        efficiencyOverride.cpglPoor,
        DEFAULT_LEADS_EXPERIMENT_RUBRIC.efficiency.cpglPoor,
      ),
    },
  };

  if (rubric.quality.qualifiedKillFloor > rubric.quality.qualifiedKeepFloor) {
    rubric.quality.qualifiedKillFloor = rubric.quality.qualifiedKeepFloor;
  }
  if (rubric.quality.greatKillFloor > rubric.quality.greatKeepFloor) {
    rubric.quality.greatKillFloor = rubric.quality.greatKeepFloor;
  }
  if (rubric.efficiency.cpqlGood > rubric.efficiency.cpqlPoor) {
    rubric.efficiency.cpqlGood = rubric.efficiency.cpqlPoor;
  }
  if (rubric.efficiency.cpglGood > rubric.efficiency.cpglPoor) {
    rubric.efficiency.cpglGood = rubric.efficiency.cpglPoor;
  }

  return rubric;
}
