// 界面接线：只负责渲染与事件，规则问 Lab.Rules，资料操作走 Lab.Samples，存取走 Lab.Store
const state = Lab.Store.load();

const form = document.querySelector("#sampleForm");
const photoInput = document.querySelector("#photoInput");
const sampleGrid = document.querySelector("#sampleGrid");
const comparePane = document.querySelector("#comparePane");
const workbench = document.querySelector("#workbench");
const mineralFilter = document.querySelector("#mineralFilter");
const polarFilter = document.querySelector("#polarFilter");
const replacePhotoInput = document.querySelector("#replacePhotoInput");

let pendingPhoto = "";
let pendingFieldPhoto = "";
let pendingReplaceFieldId = null;

function save() {
  Lab.Store.save(state);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function fmt(iso) {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) return resolve("");
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.readAsDataURL(file);
  });
}

function currentSample() {
  return state.samples.find((sample) => sample.id === state.selectedId) || null;
}

function coverPhoto(sample) {
  const first = Lab.Samples.sortedFields(sample)[0];
  return first ? first.photo : "";
}

function filteredSamples() {
  const mineral = mineralFilter.value.trim();
  const polarization = polarFilter.value;
  return state.samples.filter((sample) => {
    const mineralMatch = !mineral || sample.minerals.includes(mineral);
    const polarMatch = !polarization || sample.polarization === polarization;
    return mineralMatch && polarMatch;
  });
}

function renderGrid() {
  const rows = filteredSamples();
  sampleGrid.innerHTML = rows.length ? rows.map((sample) => {
    const photo = coverPhoto(sample);
    const status = sample.mosaic
      ? `拼版 v${sample.mosaic.version}`
      : "未拼接";
    const porosity = sample.porosityResult
      ? `孔隙率 ${sample.porosityResult.value}%`
      : "孔隙率未生成";
    return `
      <article class="sample-card ${sample.id === state.selectedId ? "selected" : ""}">
        ${photo ? `<img src="${photo}" alt="${esc(sample.code)}显微照片">` : "<div class=\"photo-placeholder\"></div>"}
        <div class="sample-body">
          <h3>${esc(sample.code)}</h3>
          <p>${esc(sample.location || "未记录地点")} · ${esc(sample.magnification || "未记录倍数")} · ${esc(sample.polarization)}</p>
          <p>矿物：${esc(sample.minerals || "未记录")}</p>
          <p>结构：${esc(sample.texture || "未记录")}</p>
          <p>${esc(sample.comment || "未填写批注")}</p>
          <p class="status-line">视域 ${sample.fields.length} 张 · ${status} · ${porosity}</p>
          <div class="card-actions">
            <label><input type="checkbox" data-compare="${sample.id}" ${state.compare.includes(sample.id) ? "checked" : ""}>对比</label>
            <button type="button" data-select="${sample.id}">核验</button>
            <button type="button" data-delete="${sample.id}">删除</button>
          </div>
        </div>
      </article>
    `;
  }).join("") : "<p>还没有样本，先从左侧录入一张薄片照片。</p>";
}

function renderCompare() {
  const compareSamples = state.compare
    .map((id) => state.samples.find((sample) => sample.id === id))
    .filter(Boolean)
    .slice(0, 2);

  comparePane.innerHTML = compareSamples.length ? compareSamples.map((sample) => {
    const photo = coverPhoto(sample);
    return `
      <article class="compare-item">
        ${photo ? `<img src="${photo}" alt="${esc(sample.code)}对比图">` : ""}
        <h3>${esc(sample.code)}</h3>
        <p>${esc(sample.polarization)} · ${esc(sample.minerals || "未记录矿物")}</p>
        <p>${esc(sample.texture || "未记录结构")}</p>
      </article>
    `;
  }).join("") : "<p>勾选两张样本卡片后可并排对比。</p>";
}

function fieldRow(field, index, total) {
  const overlapLabel = index === 0 ? "—" : field.overlap === null ? "未填" : `${field.overlap}%`;
  return `
    <li class="field-row">
      <span class="field-seq">#${field.seq}</span>
      ${field.photo ? `<img src="${field.photo}" alt="视域 ${field.seq}">` : "<div class=\"thumb-placeholder\">无照片</div>"}
      <div class="field-meta">
        <p>${esc(field.polarization)}${field.photo ? "" : " <span class=\"badge-invalid\">缺照片，不计入有效视域</span>"}</p>
        <p>重叠 ${overlapLabel} · 覆盖 ${field.coverage}% · 孔隙率 ${field.porosity === null ? "未填" : `${field.porosity}%`}</p>
        <label>标尺 <input data-scale="${field.id}" value="${esc(field.scale)}" placeholder="如 2.5 µm/px"></label>
      </div>
      <div class="field-actions">
        <button type="button" data-replace="${field.id}">替换照片</button>
        <button type="button" data-move-up="${field.id}" ${index === 0 ? "disabled" : ""}>上移</button>
        <button type="button" data-move-down="${field.id}" ${index === total - 1 ? "disabled" : ""}>下移</button>
        <button type="button" data-remove-field="${field.id}">移除</button>
      </div>
    </li>
  `;
}

function stitchPanel(sample, fields) {
  const check = Lab.Rules.checkStitch(fields);
  const verdict = check.ok
    ? "<p class=\"ok\">重叠率、偏光、标尺均满足要求，可以拼接。</p>"
    : `<ul class="problems">${check.problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`;
  const current = sample.mosaic
    ? `<p class="current">当前拼版 v${sample.mosaic.version} · ${fmt(sample.mosaic.createdAt)}<br>视域顺序 ${sample.mosaic.fieldSeqs.join(" → ")} · ${esc(sample.mosaic.polarization)} · 标尺 ${esc(sample.mosaic.scale)}</p>`
    : "<p class=\"hint\">暂无有效拼版，原视域保留。</p>";
  return `
    <div class="panel">
      <h3>拼接判定</h3>
      ${verdict}
      <button id="stitchBtn" type="button" ${check.ok ? "" : "disabled"}>执行拼接</button>
      ${current}
    </div>
  `;
}

function porosityPanel(sample, fields) {
  const check = Lab.Rules.checkPorosity(fields);
  const verdict = check.ok
    ? "<p class=\"ok\">有效视域与覆盖面积均达标，可以生成孔隙率。</p>"
    : `<ul class="problems">${check.problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`;
  const current = sample.porosityResult
    ? `<p class="current">孔隙率 v${sample.porosityResult.version} = <strong>${sample.porosityResult.value}%</strong><br>覆盖 ${sample.porosityResult.coverage}% · 基于视域 ${sample.porosityResult.fieldSeqs.join("、")} · ${fmt(sample.porosityResult.createdAt)}</p>`
    : "<p class=\"hint\">尚未生成孔隙率。</p>";
  return `
    <div class="panel">
      <h3>孔隙率核验</h3>
      <p>有效视域 ${check.validCount}/${Lab.Rules.POROSITY_MIN_FIELDS} 张 · 覆盖 ${check.coverage}%/${Lab.Rules.POROSITY_MIN_COVERAGE}%</p>
      ${verdict}
      <button id="porosityBtn" type="button" ${check.ok ? "" : "disabled"}>生成孔隙率</button>
      ${current}
    </div>
  `;
}

function historyPanel(sample) {
  const items = sample.history.map((entry) => {
    const label = entry.kind === "mosaic" ? `拼版 v${entry.version}` : `孔隙率 v${entry.version}（${entry.snapshot.value}%）`;
    return `<li>${label} · ${esc(entry.reason)} · 失效于 ${fmt(entry.invalidatedAt)}</li>`;
  }).join("");
  return `
    <div class="panel">
      <h3>历史版本</h3>
      ${sample.history.length ? `<ul class="history">${items}</ul>` : "<p class=\"hint\">暂无失效版本。</p>"}
    </div>
  `;
}

function renderWorkbench() {
  const sample = currentSample();
  if (!sample) {
    workbench.innerHTML = `
      <h2>核验台</h2>
      <p class="hint">在样本卡片上点“核验”，进入视域拼接与孔隙率核验。</p>
    `;
    return;
  }
  const fields = Lab.Samples.sortedFields(sample);
  const nextSeq = fields.length ? Math.max(...fields.map((field) => field.seq)) + 1 : 1;
  const lastScale = fields.length ? fields[fields.length - 1].scale : "";
  const polarOptions = ["单偏光", "正交偏光", "反射光"]
    .map((item) => `<option ${item === sample.polarization ? "selected" : ""}>${item}</option>`)
    .join("");

  workbench.innerHTML = `
    <h2>核验台 · ${esc(sample.code)}</h2>
    <p class="sample-tag">${esc(sample.location || "未记录地点")} · ${esc(sample.magnification || "未记录倍数")} · ${esc(sample.polarization)}</p>

    <h3 class="section-title">视域序列（按序号归档）</h3>
    ${fields.length ? `<ul class="field-list">${fields.map((field, index) => fieldRow(field, index, fields.length)).join("")}</ul>` : "<p class=\"hint\">还没有视域，先添加一张。</p>"}

    <form id="fieldForm" class="field-form">
      <h3>添加视域（序号 ${nextSeq}）</h3>
      <label>视域照片<input id="fieldPhotoInput" type="file" accept="image/*"></label>
      <div class="pair">
        <label>偏光类型<select name="polarization">${polarOptions}</select></label>
        <label>标尺<input name="scale" value="${esc(lastScale)}" placeholder="与已有视域一致"></label>
      </div>
      <div class="pair">
        <label>与上一视域重叠率（%）<input name="overlap" type="number" min="0" max="100" step="1" placeholder="20–35"></label>
        <label>覆盖面积（%）<input name="coverage" type="number" min="0" max="100" step="1"></label>
      </div>
      <label>视域孔隙率（%）<input name="porosity" type="number" min="0" max="100" step="0.1"></label>
      <button type="submit">添加视域</button>
    </form>

    ${stitchPanel(sample, fields)}
    ${porosityPanel(sample, fields)}
    ${historyPanel(sample)}
  `;
}

function render() {
  renderGrid();
  renderCompare();
  renderWorkbench();
}

photoInput.addEventListener("change", async () => {
  pendingPhoto = await readFileAsDataUrl(photoInput.files[0]);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  if (!pendingPhoto && photoInput.files[0]) {
    pendingPhoto = await readFileAsDataUrl(photoInput.files[0]);
  }
  const sample = Lab.Samples.createSample({
    photo: pendingPhoto,
    code: data.get("code").trim(),
    location: data.get("location").trim(),
    magnification: data.get("magnification").trim(),
    polarization: data.get("polarization"),
    scale: data.get("scale").trim(),
    minerals: data.get("minerals").trim(),
    texture: data.get("texture").trim(),
    comment: data.get("comment").trim()
  });
  state.samples.unshift(sample);
  state.selectedId = sample.id;
  pendingPhoto = "";
  photoInput.value = "";
  form.reset();
  save();
  render();
});

sampleGrid.addEventListener("click", (event) => {
  const deleteId = event.target.dataset.delete;
  const selectId = event.target.dataset.select;
  if (deleteId) {
    state.samples = state.samples.filter((sample) => sample.id !== deleteId);
    state.compare = state.compare.filter((id) => id !== deleteId);
    if (state.selectedId === deleteId) state.selectedId = null;
    save();
    render();
  }
  if (selectId) {
    state.selectedId = selectId;
    save();
    render();
  }
});

sampleGrid.addEventListener("change", (event) => {
  const id = event.target.dataset.compare;
  if (!id) return;
  if (event.target.checked) {
    state.compare = [id, ...state.compare.filter((item) => item !== id)].slice(0, 2);
  } else {
    state.compare = state.compare.filter((item) => item !== id);
  }
  save();
  render();
});

workbench.addEventListener("submit", async (event) => {
  if (event.target.id !== "fieldForm") return;
  event.preventDefault();
  const sample = currentSample();
  if (!sample) return;
  const data = new FormData(event.target);
  const fileInput = event.target.querySelector('input[type="file"]');
  if (!pendingFieldPhoto && fileInput && fileInput.files[0]) {
    pendingFieldPhoto = await readFileAsDataUrl(fileInput.files[0]);
  }
  Lab.Samples.addField(sample, {
    photo: pendingFieldPhoto,
    polarization: data.get("polarization"),
    scale: data.get("scale"),
    overlap: data.get("overlap"),
    coverage: data.get("coverage"),
    porosity: data.get("porosity")
  });
  pendingFieldPhoto = "";
  save();
  render();
});

workbench.addEventListener("click", (event) => {
  const sample = currentSample();
  if (!sample) return;
  const target = event.target;
  if (target.dataset.replace) {
    pendingReplaceFieldId = target.dataset.replace;
    replacePhotoInput.click();
    return;
  }
  if (target.dataset.moveUp) {
    Lab.Samples.moveField(sample, target.dataset.moveUp, -1);
  } else if (target.dataset.moveDown) {
    Lab.Samples.moveField(sample, target.dataset.moveDown, 1);
  } else if (target.dataset.removeField) {
    Lab.Samples.removeField(sample, target.dataset.removeField);
  } else if (target.id === "stitchBtn") {
    Lab.Samples.stitch(sample);
  } else if (target.id === "porosityBtn") {
    Lab.Samples.generatePorosity(sample);
  } else {
    return;
  }
  save();
  render();
});

workbench.addEventListener("change", async (event) => {
  const sample = currentSample();
  if (!sample) return;
  if (event.target.dataset.scale) {
    Lab.Samples.updateFieldScale(sample, event.target.dataset.scale, event.target.value);
    save();
    render();
  } else if (event.target.id === "fieldPhotoInput") {
    pendingFieldPhoto = await readFileAsDataUrl(event.target.files[0]);
  }
});

replacePhotoInput.addEventListener("change", async () => {
  const sample = currentSample();
  const photo = await readFileAsDataUrl(replacePhotoInput.files[0]);
  if (sample && pendingReplaceFieldId && photo) {
    Lab.Samples.replaceFieldPhoto(sample, pendingReplaceFieldId, photo);
    save();
    render();
  }
  pendingReplaceFieldId = null;
  replacePhotoInput.value = "";
});

[mineralFilter, polarFilter].forEach((field) => field.addEventListener("input", renderGrid));

document.querySelector("#exportBtn").addEventListener("click", () => {
  const checklist = state.samples.map((sample) => ({
    样本编号: sample.code,
    采样地点: sample.location,
    放大倍数: sample.magnification,
    偏光类型: sample.polarization,
    主要矿物: sample.minerals,
    颗粒结构: sample.texture,
    老师批注: sample.comment,
    视域: Lab.Samples.sortedFields(sample).map((field) => ({
      序号: field.seq,
      偏光类型: field.polarization,
      标尺: field.scale,
      与上一视域重叠率: field.overlap,
      覆盖面积: field.coverage,
      孔隙率: field.porosity
    })),
    当前拼版: sample.mosaic ? `v${sample.mosaic.version}（视域 ${sample.mosaic.fieldSeqs.join("→")}）` : "无",
    当前孔隙率: sample.porosityResult ? `${sample.porosityResult.value}%` : "未生成",
    历史版本: sample.history.map((entry) => `${entry.kind === "mosaic" ? "拼版" : "孔隙率"} v${entry.version}（${entry.reason}）`)
  }));
  const blob = new Blob([JSON.stringify(checklist, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "thin-section-checklist.json";
  link.click();
  URL.revokeObjectURL(link.href);
});

render();
