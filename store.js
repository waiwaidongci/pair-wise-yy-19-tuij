/* 档案存取层：localStorage 读写、版本号发放、失效登记与历史归档。
   不做判定，判定结果由调用方传入。 */
window.ArchiveStore = (() => {
  const KEY = "wxyy-3-stitch-porosity-lab";
  const EMPTY = { samples: [], selectedId: null };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return JSON.parse(JSON.stringify(EMPTY));
      const data = JSON.parse(raw);
      return { ...JSON.parse(JSON.stringify(EMPTY)), ...data };
    } catch {
      return JSON.parse(JSON.stringify(EMPTY));
    }
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function ensureArchive(sample) {
    sample.views ||= [];
    sample.history ||= [];
    sample.mosaic ||= null;
    sample.porosity ||= null;
    sample.versionCounter ||= 0;
    return sample;
  }

  function nextVersion(sample) {
    ensureArchive(sample);
    sample.versionCounter += 1;
    return sample.versionCounter;
  }

  /* 拼版失效：有效版本转入历史，可事后查询 */
  function archiveMosaic(sample, reason, at) {
    if (sample.mosaic?.status !== "valid") return;
    sample.history.unshift({
      kind: "mosaic",
      version: sample.mosaic.version,
      viewSeqs: sample.mosaic.viewSeqs,
      createdAt: sample.mosaic.createdAt,
      invalidatedAt: at,
      reason
    });
    sample.mosaic = { ...sample.mosaic, status: "stale", staleReason: reason, invalidatedAt: at };
  }

  /* 孔隙率失效：读数与覆盖情况一并入档 */
  function archivePorosity(sample, reason, at) {
    if (sample.porosity?.status !== "valid") return;
    sample.history.unshift({
      kind: "porosity",
      version: sample.porosity.version,
      value: sample.porosity.value,
      coverage: sample.porosity.coverage,
      viewCount: sample.porosity.viewCount,
      viewSeqs: sample.porosity.viewSeqs,
      createdAt: sample.porosity.createdAt,
      invalidatedAt: at,
      reason
    });
    sample.porosity = { ...sample.porosity, status: "stale", staleReason: reason, invalidatedAt: at };
  }

  /* 视域变动（替换照片 / 调整标尺 / 移除 / 增删改序）→ 拼版与孔隙率立即失效 */
  function invalidate(sample, reason) {
    ensureArchive(sample);
    const at = new Date().toISOString();
    archiveMosaic(sample, reason, at);
    archivePorosity(sample, reason, at);
    return sample;
  }

  /* 拼接判定通过后登记新拼版；视域组合变化时，旧孔隙率同步失效 */
  function recordMosaic(sample, viewSeqs) {
    ensureArchive(sample);
    const signature = viewSeqs.join(",");
    if (sample.porosity?.status === "valid" && (sample.porosity.viewSeqs || []).join(",") !== signature) {
      archivePorosity(sample, "拼版更新", new Date().toISOString());
    }
    sample.mosaic = {
      status: "valid",
      version: nextVersion(sample),
      viewSeqs,
      createdAt: new Date().toISOString()
    };
    return sample.mosaic;
  }

  /* 孔隙率核验通过后登记新读数 */
  function recordPorosity(sample, result) {
    ensureArchive(sample);
    sample.porosity = {
      status: "valid",
      version: nextVersion(sample),
      value: result.value,
      coverage: result.coverage,
      viewCount: result.viewCount,
      viewSeqs: result.viewSeqs,
      createdAt: new Date().toISOString()
    };
    return sample.porosity;
  }

  return { load, save, ensureArchive, invalidate, recordMosaic, recordPorosity };
})();
