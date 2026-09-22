/* 样品资料与界面交互层：判定交给 StitchRules，存取交给 ArchiveStore。 */
const state = ArchiveStore.load();

const sampleForm = document.querySelector("#sampleForm");
const sampleGrid = document.querySelector("#sampleGrid");
const mineralFilter = document.querySelector("#mineralFilter");
const statusFilter = document.querySelector("#statusFilter");
const labPane = document.querySelector("#labPane");
const exportBtn = document.querySelector("#exportBtn");

let pendingViewPhoto = "";

const POLARIZATIONS = ["单偏光", "正交偏光", "反射光"];
const FIELD_LABEL = {
  polarization: "偏光",
  scale: "标尺",
  overlap: "重叠率",
  area: "面积份额",
  pore: "孔隙率读数"
};
const STATUS_CLASS = { 拼版有效: "ok", 禁止拼接: "bad", 已失效: "warn", 未拼接: "mute" };

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString("zh-CN", { hour12: false }) : "—");
const fmtPct = (n) => `${Number(n).toFixed(1)}%`;
const parseNum = (raw) => {
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
};

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) return resolve("");
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.readAsDataURL(file);
  });
}

function persist() {
  ArchiveStore.save(state);
  render();
}

const findSample = (id) => state.samples.find((sample) => sample.id === id);
const selectedSample = () => findSample(state.selectedId) || null;
const orderedViews = (sample) => [...(sample.views || [])].sort((a, b) => a.seq - b.seq);

function sampleStatus(sample) {
  if (sample.mosaic?.status === "valid") return "拼版有效";
  if (sample.mosaic?.status === "stale" || sample.porosity?.status === "stale") return "已失效";
  if (sample.mosaic?.status === "blocked") return "禁止拼接";
  return "未拼接";
}

/* ---------- 样品列表 ---------- */

function filteredSamples() {
  const mineral = mineralFilter.value.trim();
  const status = statusFilter.value;
  return state.samples.filter((sample) => {
    const mineralMatch = !mineral || (sample.minerals || "").includes(mineral);
    const statusMatch = !status || sampleStatus(sample) === status;
    return mineralMatch && statusMatch;
  });
}

function sampleCardHtml(sample) {
  const status = sampleStatus(sample);
  const porosity = sample.porosity?.status === "valid" ? ` · 孔隙率 ${sample.porosity.value.toFixed(2)}%` : "";
  return `
    <article class="sample-card ${sample.id === state.selectedId ? "selected" : ""}">
      <div class="sample-body">
        <div class="card-top">
          <h3>${esc(sample.code)}</h3>
          <span class="badge ${STATUS_CLASS[status]}">${status}</span>
        </div>
        <p>${esc(sample.location || "未记录地点")} · ${esc(sample.magnification || "未记录倍数")}</p>
        <p>矿物：${esc(sample.minerals || "未记录")}</p>
        <p>视域 ${(sample.views || []).length} 张${porosity}</p>
        <div class="card-actions">
          <button type="button" data-open="${sample.id}">核验台</button>
          <button type="button" class="danger" data-delete="${sample.id}">删除</button>
        </div>
      </div>
    </article>
  `;
}

function renderSamples() {
  const rows = filteredSamples();
  sampleGrid.innerHTML = rows.length
    ? rows.map(sampleCardHtml).join("")
    : "<p class='muted'>没有符合条件的样品，请从左侧录入。</p>";
}

/* ---------- 核验台 ---------- */

function viewItemHtml(view, isFirst) {
  return `
    <li class="view-item" data-view="${view.id}">
      <div class="view-top">
        <span class="view-seq">视域 ${view.seq}</span>
        <span class="view-ops">
          <button type="button" data-move="-1" title="上移">↑</button>
          <button type="button" data-move="1" title="下移">↓</button>
          <label class="rephoto">换图<input type="file" accept="image/*" data-rephoto hidden></label>
          <button type="button" class="danger" data-removeview>移除</button>
        </span>
      </div>
      ${view.photo
        ? `<img class="view-img" src="${view.photo}" alt="视域 ${view.seq} 显微照片">`
        : `<div class="view-img ph">未附照片</div>`}
      <div class="view-fields">
        <label>偏光
          <select data-field="polarization">
            ${POLARIZATIONS.map((p) => `<option ${p === view.polarization ? "selected" : ""}>${p}</option>`).join("")}
          </select>
        </label>
        <label>标尺<input data-field="scale" value="${esc(view.scale)}" placeholder="200µm"></label>
        <label>重叠率%<input data-field="overlap" type="number" min="0" max="100" step="1"
          value="${view.overlap ?? ""}" ${isFirst ? "disabled" : ""} placeholder="${isFirst ? "首张" : "20–35"}"></label>
        <label>面积%<input data-field="area" type="number" min="1" max="100" step="1" value="${view.area ?? ""}"></label>
        <label>孔隙率%<input data-field="pore" type="number" min="0" max="100" step="0.1" value="${view.pore ?? ""}"></label>
      </div>
    </li>
  `;
}

function mosaicStripHtml(sample, extraClass) {
  const views = orderedViews(sample);
  if (!views.length) return "";
  const cells = views
    .map((view, index) => {
      const shift = index ? Math.round(((Number(view.overlap) || 0) / 100) * 160) : 0;
      const style = index ? ` style="margin-left:-${shift}px"` : "";
      const inner = view.photo ? `<img src="${view.photo}" alt="视域 ${view.seq}">` : `<span>${view.seq}</span>`;
      return `<div class="mosaic-cell"${style}>${inner}<em>${view.seq}</em></div>`;
    })
    .join("");
  return `<div class="mosaic-strip ${extraClass}">${cells}</div>`;
}

function stitchPanelHtml(sample) {
  const mosaic = sample.mosaic;
  let body = "";
  if (mosaic?.status === "valid") {
    body = `<p class="result ok">拼版 v${mosaic.version} 有效 · ${fmtTime(mosaic.createdAt)} 生成</p>${mosaicStripHtml(sample, "")}`;
  } else if (mosaic?.status === "stale") {
    body = `<p class="result warn">拼版 v${mosaic.version} 已失效：${esc(mosaic.staleReason)}（${fmtTime(mosaic.invalidatedAt)}）</p>${mosaicStripHtml(sample, "stale")}`;
  } else if (mosaic?.status === "blocked") {
    body = `<p class="result bad">禁止拼接，原视域已保留</p>
      <ul class="problems">${mosaic.problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`;
  } else {
    body = `<p class="muted">尚未拼接。重叠率须在 ${StitchRules.OVERLAP_MIN}%–${StitchRules.OVERLAP_MAX}%，且偏光、标尺一致。</p>`;
  }
  return `
    <section class="lab-block">
      <div class="lab-block-head"><h3>视域拼接</h3><button type="button" data-stitch>执行拼接判定</button></div>
      ${body}
    </section>
  `;
}

function porosityPanelHtml(sample) {
  const views = orderedViews(sample);
  const coverage = StitchRules.coverageOf(views);
  const porosity = sample.porosity;
  let body = `<p class="muted">当前 ${views.length} 张视域，估算覆盖 ${fmtPct(coverage)}（门槛：≥${StitchRules.MIN_VALID_VIEWS} 张有效视域且覆盖 ≥${StitchRules.MIN_COVERAGE}%）</p>`;
  if (porosity?.status === "valid") {
    body += `<p class="result ok big">孔隙率 ${porosity.value.toFixed(2)}%
      <small>v${porosity.version} · 覆盖 ${fmtPct(porosity.coverage)} · ${porosity.viewCount} 张视域 · ${fmtTime(porosity.createdAt)}</small></p>`;
  } else if (porosity?.status === "stale") {
    body += `<p class="result warn">孔隙率 v${porosity.version} 已失效：${esc(porosity.staleReason)}（${fmtTime(porosity.invalidatedAt)}）</p>`;
  }
  const check = sample.lastPorosityCheck;
  if (check && !check.ok && porosity?.status !== "valid") {
    body += `<p class="result bad">未通过核验，未生成孔隙率</p>
      <ul class="problems">${check.problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`;
  }
  return `
    <section class="lab-block">
      <div class="lab-block-head"><h3>孔隙率核验</h3><button type="button" data-porosity>生成孔隙率</button></div>
      ${body}
    </section>
  `;
}

function historyHtml(sample) {
  const items = (sample.history || []).map((entry) =>
    entry.kind === "mosaic"
      ? `<li><b>拼版 v${entry.version}</b> · 视域 [${entry.viewSeqs.join(", ")}] · ${fmtTime(entry.createdAt)} 生成 → ${fmtTime(entry.invalidatedAt)} 失效（${esc(entry.reason)}）</li>`
      : `<li><b>孔隙率 v${entry.version}</b> = ${entry.value.toFixed(2)}% · 覆盖 ${fmtPct(entry.coverage)} · ${entry.viewCount} 张视域 · ${fmtTime(entry.createdAt)} 生成 → ${fmtTime(entry.invalidatedAt)} 失效（${esc(entry.reason)}）</li>`
  );
  return `
    <section class="lab-block">
      <h3>历史版本</h3>
      ${items.length ? `<ul class="history">${items.join("")}</ul>` : `<p class="muted">暂无失效版本。</p>`}
    </section>
  `;
}

function renderLab() {
  const sample = selectedSample();
  if (!sample) {
    labPane.innerHTML = `<h2>核验台</h2><p class="muted">在样品卡片上点「核验台」，开始录入视域、拼接与孔隙率核验。</p>`;
    return;
  }
  const views = orderedViews(sample);
  labPane.innerHTML = `
    <div class="lab-head">
      <div>
        <h2>${esc(sample.code)} · 核验台</h2>
        <p class="muted">${esc(sample.location || "未记录地点")} · ${esc(sample.magnification || "—")} · ${esc(sample.minerals || "未记录矿物")}</p>
      </div>
      <button type="button" class="ghost" data-close-lab>收起</button>
    </div>

    <form id="viewForm" class="view-form">
      <h3>视域录入</h3>
      <label>视域照片<input id="viewPhotoInput" type="file" accept="image/*"></label>
      <div class="pair">
        <label>偏光
          <select name="polarization">${POLARIZATIONS.map((p) => `<option>${p}</option>`).join("")}</select>
        </label>
        <label>标尺<input name="scale" placeholder="200µm" required></label>
      </div>
      <div class="pair">
        <label>与上一视域重叠率%<input name="overlap" type="number" min="0" max="100" step="1" placeholder="20–35"></label>
        <label>面积份额%<input name="area" type="number" min="1" max="100" step="1" value="30" required></label>
      </div>
      <label>孔隙率读数%<input name="pore" type="number" min="0" max="100" step="0.1" required></label>
      <button type="submit">加入视域序列</button>
    </form>

    <section class="lab-block">
      <h3>视域序列（按视域序号归档）</h3>
      ${views.length
        ? `<ul class="view-list">${views.map((view, index) => viewItemHtml(view, index === 0)).join("")}</ul>`
        : `<p class="muted">还没有视域，先录入第一张。</p>`}
    </section>

    ${stitchPanelHtml(sample)}
    ${porosityPanelHtml(sample)}
    ${historyHtml(sample)}
  `;
  pendingViewPhoto = "";
}

function render() {
  renderSamples();
  renderLab();
}

/* ---------- 判定动作 ---------- */

function runStitch(sample) {
  const check = StitchRules.stitchCheck(sample.views);
  const at = new Date().toISOString();
  sample.lastCheck = { ok: check.ok, problems: check.problems, at };
  if (check.ok) {
    ArchiveStore.recordMosaic(sample, check.views.map((view) => view.seq));
  } else {
    sample.mosaic = { status: "blocked", problems: check.problems, attemptedAt: at };
  }
}

function runPorosity(sample) {
  const check = StitchRules.porosityCheck(sample.views);
  const at = new Date().toISOString();
  sample.lastPorosityCheck = { ok: check.ok, problems: check.problems, coverage: check.coverage, at };
  if (check.ok) {
    ArchiveStore.recordPorosity(sample, {
      value: StitchRules.porosityOf(check.views),
      coverage: check.coverage,
      viewCount: check.views.length,
      viewSeqs: check.views.map((view) => view.seq)
    });
  }
}

/* ---------- 事件 ---------- */

sampleForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(sampleForm);
  const sample = ArchiveStore.ensureArchive({
    id: crypto.randomUUID(),
    code: data.get("code").trim(),
    location: data.get("location").trim(),
    magnification: data.get("magnification").trim(),
    minerals: data.get("minerals").trim(),
    texture: data.get("texture").trim(),
    comment: data.get("comment").trim(),
    createdAt: new Date().toISOString()
  });
  state.samples.unshift(sample);
  state.selectedId = sample.id;
  sampleForm.reset();
  persist();
});

sampleGrid.addEventListener("click", (event) => {
  const openId = event.target.dataset.open;
  const deleteId = event.target.dataset.delete;
  if (openId) {
    state.selectedId = openId;
    persist();
    return;
  }
  if (deleteId) {
    if (!confirm("删除该样品及其全部视域与历史版本？")) return;
    state.samples = state.samples.filter((sample) => sample.id !== deleteId);
    if (state.selectedId === deleteId) state.selectedId = null;
    persist();
  }
});

labPane.addEventListener("submit", (event) => {
  if (event.target.id !== "viewForm") return;
  event.preventDefault();
  const sample = selectedSample();
  if (!sample) return;
  const data = new FormData(event.target);
  const seq = sample.views.reduce((max, view) => Math.max(max, view.seq), 0) + 1;
  sample.views.push({
    id: crypto.randomUUID(),
    seq,
    photo: pendingViewPhoto,
    polarization: data.get("polarization"),
    scale: data.get("scale").trim(),
    overlap: sample.views.length === 0 ? null : parseNum(data.get("overlap")),
    area: parseNum(data.get("area")),
    pore: parseNum(data.get("pore")),
    addedAt: new Date().toISOString()
  });
  ArchiveStore.invalidate(sample, `新增视域 ${seq}`);
  pendingViewPhoto = "";
  persist();
});

labPane.addEventListener("click", (event) => {
  const sample = selectedSample();
  if (!sample) return;
  const target = event.target;

  if (target.dataset.closeLab !== undefined) {
    state.selectedId = null;
    persist();
    return;
  }
  if (target.dataset.stitch !== undefined) {
    runStitch(sample);
    persist();
    return;
  }
  if (target.dataset.porosity !== undefined) {
    runPorosity(sample);
    persist();
    return;
  }

  const viewEl = target.closest("[data-view]");
  if (!viewEl) return;
  const view = sample.views.find((item) => item.id === viewEl.dataset.view);
  if (!view) return;

  if (target.dataset.move) {
    const list = orderedViews(sample);
    const index = list.findIndex((item) => item.id === view.id);
    const neighbor = list[index + Number(target.dataset.move)];
    if (!neighbor) return;
    [view.seq, neighbor.seq] = [neighbor.seq, view.seq];
    ArchiveStore.invalidate(sample, "视域顺序调整");
    persist();
    return;
  }
  if (target.dataset.removeview !== undefined) {
    sample.views = sample.views.filter((item) => item.id !== view.id);
    ArchiveStore.invalidate(sample, `视域 ${view.seq} 被移除`);
    persist();
  }
});

labPane.addEventListener("change", (event) => {
  const sample = selectedSample();
  if (!sample) return;
  const target = event.target;

  if (target.id === "viewPhotoInput") {
    readFileAsDataUrl(target.files[0]).then((url) => {
      pendingViewPhoto = url;
    });
    return;
  }

  const viewEl = target.closest("[data-view]");
  if (!viewEl) return;
  const view = sample.views.find((item) => item.id === viewEl.dataset.view);
  if (!view) return;

  if (target.dataset.rephoto !== undefined) {
    readFileAsDataUrl(target.files[0]).then((url) => {
      if (!url) return;
      view.photo = url;
      ArchiveStore.invalidate(sample, `视域 ${view.seq} 照片被替换`);
      persist();
    });
    return;
  }

  const field = target.dataset.field;
  if (!field) return;
  if (["overlap", "area", "pore"].includes(field)) {
    view[field] = parseNum(target.value);
  } else if (field === "scale") {
    view.scale = target.value.trim();
  } else {
    view[field] = target.value;
  }
  ArchiveStore.invalidate(sample, `视域 ${view.seq} ${FIELD_LABEL[field] || "参数"}调整`);
  persist();
});

[mineralFilter, statusFilter].forEach((field) => field.addEventListener("input", render));

exportBtn.addEventListener("click", () => {
  const archive = {
    导出时间: new Date().toISOString(),
    样品: state.samples.map((sample) => ({
      样品编号: sample.code,
      采样地点: sample.location,
      放大倍数: sample.magnification,
      主要矿物: sample.minerals,
      颗粒结构: sample.texture,
      批注: sample.comment,
      视域: orderedViews(sample).map((view) => ({
        视域序号: view.seq,
        偏光: view.polarization,
        标尺: view.scale,
        重叠率: view.overlap,
        面积份额: view.area,
        孔隙率读数: view.pore
      })),
      当前拼版: sample.mosaic,
      当前孔隙率: sample.porosity,
      历史版本: sample.history
    }))
  };
  const blob = new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "thin-section-lab-archive.json";
  link.click();
  URL.revokeObjectURL(link.href);
});

render();
