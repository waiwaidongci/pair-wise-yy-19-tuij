// 档案存取：负责 localStorage 的读写与旧档案规范化，不管业务规则
window.Lab = window.Lab || {};

Lab.Store = (() => {
  const key = "wxyy-2-thin-section-index";

  function normalizeField(field, index) {
    const overlap = field.overlap === null || field.overlap === undefined || field.overlap === ""
      ? null
      : Number(field.overlap);
    const porosity = field.porosity === null || field.porosity === undefined || field.porosity === ""
      ? null
      : Number(field.porosity);
    return {
      id: field.id || crypto.randomUUID(),
      seq: typeof field.seq === "number" ? field.seq : index + 1,
      photo: field.photo || "",
      polarization: field.polarization || "单偏光",
      scale: (field.scale || "").trim(),
      overlap,
      coverage: Number(field.coverage) || 0,
      porosity
    };
  }

  function normalizeSample(sample) {
    const fields = Array.isArray(sample.fields) ? sample.fields.map(normalizeField) : [];
    // 旧档案只有一张样本照片，迁移为 1 号视域
    if (!fields.length && sample.photo) {
      fields.push(normalizeField({
        photo: sample.photo,
        polarization: sample.polarization,
        scale: sample.scale
      }, 0));
    }
    fields.sort((a, b) => a.seq - b.seq);
    return {
      id: sample.id || crypto.randomUUID(),
      code: sample.code || "",
      location: sample.location || "",
      magnification: sample.magnification || "",
      polarization: sample.polarization || "单偏光",
      minerals: sample.minerals || "",
      texture: sample.texture || "",
      comment: sample.comment || "",
      createdAt: sample.createdAt || new Date().toISOString(),
      fields,
      mosaic: sample.mosaic || null,
      porosityResult: sample.porosityResult || null,
      history: Array.isArray(sample.history) ? sample.history : [],
      mosaicVersion: sample.mosaicVersion || 0,
      porosityVersion: sample.porosityVersion || 0
    };
  }

  function load() {
    let raw = {};
    try {
      raw = JSON.parse(localStorage.getItem(key) || "{}");
    } catch {
      raw = {};
    }
    return {
      samples: (raw.samples || []).map(normalizeSample),
      compare: Array.isArray(raw.compare) ? raw.compare : [],
      selectedId: raw.selectedId || null
    };
  }

  function save(state) {
    localStorage.setItem(key, JSON.stringify(state));
  }

  return { load, save };
})();
