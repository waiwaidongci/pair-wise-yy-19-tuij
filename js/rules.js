// 判定规则：拼接与孔隙率的硬性门槛，不碰状态、不碰界面
window.Lab = window.Lab || {};

Lab.Rules = (() => {
  const OVERLAP_MIN = 20;
  const OVERLAP_MAX = 35;
  const POROSITY_MIN_FIELDS = 3;
  const POROSITY_MIN_COVERAGE = 80;

  function validFields(fields) {
    return fields.filter((field) => field.photo);
  }

  // 拼接门槛：重叠率 20%–35%、偏光一致、标尺一致，缺一不可
  function checkStitch(fields) {
    const problems = [];
    if (fields.length < 2) {
      problems.push("至少需要两张视域才能拼接");
    }
    const polarizations = [...new Set(fields.map((field) => field.polarization))];
    if (polarizations.length > 1) {
      problems.push(`偏光类型不一致（${polarizations.join("、")}），禁止拼接`);
    }
    const scales = [...new Set(fields.map((field) => field.scale))];
    if (scales.length > 1) {
      problems.push(`标尺不一致（${scales.join("、")}），禁止拼接`);
    }
    if (scales.length === 1 && !scales[0]) {
      problems.push("尚未填写标尺，禁止拼接");
    }
    fields.forEach((field, index) => {
      if (index === 0) return;
      const overlap = field.overlap;
      if (overlap === null || Number.isNaN(overlap) || overlap < OVERLAP_MIN || overlap > OVERLAP_MAX) {
        const label = overlap === null || Number.isNaN(overlap) ? "未填写" : `${overlap}%`;
        problems.push(`视域 ${field.seq} 与前一视域重叠率 ${label}，不在 ${OVERLAP_MIN}%–${OVERLAP_MAX}% 区间，禁止拼接`);
      }
    });
    return { ok: problems.length === 0, problems };
  }

  // 孔隙率门槛：至少 3 张有效视域、合计覆盖八成面积、每张都有孔隙率读数
  function checkPorosity(fields) {
    const valid = validFields(fields);
    const coverage = valid.reduce((sum, field) => sum + (field.coverage || 0), 0);
    const problems = [];
    if (valid.length < POROSITY_MIN_FIELDS) {
      problems.push(`有效视域 ${valid.length} 张，不足 ${POROSITY_MIN_FIELDS} 张`);
    }
    if (coverage < POROSITY_MIN_COVERAGE) {
      problems.push(`有效视域覆盖 ${coverage}%，不足 ${POROSITY_MIN_COVERAGE}%`);
    }
    if (valid.length >= POROSITY_MIN_FIELDS && valid.some((field) => typeof field.porosity !== "number" || Number.isNaN(field.porosity))) {
      problems.push("部分有效视域未填写孔隙率读数");
    }
    return { ok: problems.length === 0, problems, validCount: valid.length, coverage };
  }

  // 按各视域覆盖面积加权平均
  function computePorosity(fields) {
    const valid = validFields(fields);
    const totalCoverage = valid.reduce((sum, field) => sum + field.coverage, 0);
    const weighted = valid.reduce((sum, field) => sum + field.porosity * field.coverage, 0);
    return Math.round((weighted / totalCoverage) * 100) / 100;
  }

  return {
    OVERLAP_MIN,
    OVERLAP_MAX,
    POROSITY_MIN_FIELDS,
    POROSITY_MIN_COVERAGE,
    validFields,
    checkStitch,
    checkPorosity,
    computePorosity
  };
})();
