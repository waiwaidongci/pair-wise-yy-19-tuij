/* 判定规则层：视域拼接条件与孔隙率核验门槛。
   纯函数，不读写界面、不触碰档案存取。 */
window.StitchRules = (() => {
  const OVERLAP_MIN = 20; // 重叠率下限 %
  const OVERLAP_MAX = 35; // 重叠率上限 %
  const MIN_VALID_VIEWS = 3; // 孔隙率核验所需最少有效视域
  const MIN_COVERAGE = 80; // 孔隙率核验所需最低面积覆盖 %

  const ordered = (views) => [...(views || [])].sort((a, b) => a.seq - b.seq);
  const normScale = (scale) => String(scale || "").trim();

  /* 拼接判定：重叠率 20%–35%、偏光一致、标尺相同，缺一不可 */
  function stitchCheck(views) {
    const list = ordered(views);
    const problems = [];

    if (list.length < 2) {
      problems.push("视域不足两张，无法拼接");
    }

    const polarizations = [...new Set(list.map((view) => view.polarization))];
    if (polarizations.length > 1) {
      problems.push(`偏光不一致（${polarizations.join("、")}）`);
    }

    const scales = [...new Set(list.map((view) => normScale(view.scale)))];
    if (scales.some((scale) => !scale)) {
      problems.push("存在未填写标尺的视域");
    } else if (scales.length > 1) {
      problems.push(`标尺不同（${scales.join("、")}）`);
    }

    list.slice(1).forEach((view) => {
      const overlap = Number(view.overlap);
      if (!Number.isFinite(overlap) || overlap < OVERLAP_MIN || overlap > OVERLAP_MAX) {
        problems.push(
          `视域 ${view.seq} 重叠率 ${view.overlap ?? "未填"}% 不在 ${OVERLAP_MIN}%–${OVERLAP_MAX}% 区间`
        );
      }
    });

    return { ok: problems.length === 0, problems, views: list };
  }

  /* 每张视域的有效面积份额：首张全计，后续按重叠率折减 */
  function effectiveShares(views) {
    return ordered(views).map((view, index) =>
      index === 0 ? Number(view.area) || 0 : (Number(view.area) || 0) * (1 - (Number(view.overlap) || 0) / 100)
    );
  }

  function coverageOf(views) {
    return effectiveShares(views).reduce((sum, share) => sum + share, 0);
  }

  /* 孔隙率门槛：拼接判定通过 + 至少三张有效视域 + 覆盖八成面积 */
  function porosityCheck(views) {
    const stitch = stitchCheck(views);
    const coverage = coverageOf(stitch.views);
    const problems = [...stitch.problems];

    if (stitch.views.length < MIN_VALID_VIEWS) {
      problems.push(`有效视域 ${stitch.views.length} 张，不足 ${MIN_VALID_VIEWS} 张`);
    }
    if (coverage < MIN_COVERAGE) {
      problems.push(`面积覆盖 ${coverage.toFixed(1)}%，未达 ${MIN_COVERAGE}%`);
    }

    return { ok: problems.length === 0, problems, coverage, views: stitch.views };
  }

  /* 孔隙率取值：各视域读数按有效面积份额加权 */
  function porosityOf(views) {
    const list = ordered(views);
    const shares = effectiveShares(list);
    const total = shares.reduce((sum, share) => sum + share, 0);
    if (!total) return 0;
    return list.reduce((sum, view, index) => sum + (Number(view.pore) || 0) * shares[index], 0) / total;
  }

  return {
    OVERLAP_MIN,
    OVERLAP_MAX,
    MIN_VALID_VIEWS,
    MIN_COVERAGE,
    stitchCheck,
    porosityCheck,
    porosityOf,
    coverageOf
  };
})();
