// 样品资料：样品与视域的增删改、拼版与孔隙率版本的生成和失效
window.Lab = window.Lab || {};

Lab.Samples = (() => {
  function sortedFields(sample) {
    return [...sample.fields].sort((a, b) => a.seq - b.seq);
  }

  function nextSeq(sample) {
    return sample.fields.length ? Math.max(...sample.fields.map((field) => field.seq)) + 1 : 1;
  }

  function makeField(sample, data) {
    const toNumber = (value) => (value === "" || value === null || value === undefined ? null : Number(value));
    return {
      id: crypto.randomUUID(),
      seq: nextSeq(sample),
      photo: data.photo || "",
      polarization: data.polarization || sample.polarization,
      scale: (data.scale || "").trim(),
      overlap: toNumber(data.overlap),
      coverage: Number(data.coverage) || 0,
      porosity: toNumber(data.porosity)
    };
  }

  function createSample(data) {
    const sample = {
      id: crypto.randomUUID(),
      code: data.code,
      location: data.location,
      magnification: data.magnification,
      polarization: data.polarization,
      minerals: data.minerals,
      texture: data.texture,
      comment: data.comment,
      createdAt: new Date().toISOString(),
      fields: [],
      mosaic: null,
      porosityResult: null,
      history: [],
      mosaicVersion: 0,
      porosityVersion: 0
    };
    if (data.photo) {
      sample.fields.push(makeField(sample, data));
    }
    return sample;
  }

  function addField(sample, data) {
    const field = makeField(sample, data);
    sample.fields.push(field);
    return field;
  }

  function findField(sample, fieldId) {
    return sample.fields.find((field) => field.id === fieldId);
  }

  // 拼版与孔隙率立即失效，旧版本留档可查
  function invalidate(sample, reason) {
    const now = new Date().toISOString();
    if (sample.mosaic) {
      sample.history.unshift({
        id: crypto.randomUUID(),
        kind: "mosaic",
        version: sample.mosaic.version,
        snapshot: sample.mosaic,
        createdAt: sample.mosaic.createdAt,
        invalidatedAt: now,
        reason
      });
      sample.mosaic = null;
    }
    if (sample.porosityResult) {
      sample.history.unshift({
        id: crypto.randomUUID(),
        kind: "porosity",
        version: sample.porosityResult.version,
        snapshot: sample.porosityResult,
        createdAt: sample.porosityResult.createdAt,
        invalidatedAt: now,
        reason
      });
      sample.porosityResult = null;
    }
  }

  function replaceFieldPhoto(sample, fieldId, photo) {
    const field = findField(sample, fieldId);
    if (!field || !photo) return;
    field.photo = photo;
    invalidate(sample, `替换视域 ${field.seq} 照片`);
  }

  function updateFieldScale(sample, fieldId, scale) {
    const field = findField(sample, fieldId);
    if (!field) return;
    const next = (scale || "").trim();
    if (next === field.scale) return;
    field.scale = next;
    invalidate(sample, `调整视域 ${field.seq} 标尺`);
  }

  function removeField(sample, fieldId) {
    const field = findField(sample, fieldId);
    if (!field) return;
    sample.fields = sample.fields.filter((item) => item.id !== fieldId);
    invalidate(sample, `移除视域 ${field.seq}`);
  }

  function moveField(sample, fieldId, direction) {
    const fields = sortedFields(sample);
    const index = fields.findIndex((field) => field.id === fieldId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= fields.length) return;
    const current = fields[index];
    const neighbor = fields[target];
    [current.seq, neighbor.seq] = [neighbor.seq, current.seq];
    invalidate(sample, "调整视域顺序");
  }

  // 规则不通过则拒绝拼接，原视域保留不动
  function stitch(sample) {
    const fields = sortedFields(sample);
    const check = Lab.Rules.checkStitch(fields);
    if (!check.ok) return { ok: false, problems: check.problems };
    sample.mosaicVersion += 1;
    sample.mosaic = {
      version: sample.mosaicVersion,
      createdAt: new Date().toISOString(),
      polarization: fields[0].polarization,
      scale: fields[0].scale,
      fieldSeqs: fields.map((field) => field.seq)
    };
    return { ok: true };
  }

  function generatePorosity(sample) {
    const fields = sortedFields(sample);
    const check = Lab.Rules.checkPorosity(fields);
    if (!check.ok) return { ok: false, problems: check.problems };
    sample.porosityVersion += 1;
    sample.porosityResult = {
      version: sample.porosityVersion,
      createdAt: new Date().toISOString(),
      value: Lab.Rules.computePorosity(fields),
      coverage: check.coverage,
      validCount: check.validCount,
      fieldSeqs: Lab.Rules.validFields(fields).map((field) => field.seq)
    };
    return { ok: true };
  }

  return {
    sortedFields,
    createSample,
    addField,
    findField,
    replaceFieldPhoto,
    updateFieldScale,
    removeField,
    moveField,
    stitch,
    generatePorosity
  };
})();
