/* =========================
 *  全局状态（支持多 PDF）
 * ========================= */
let docs = [];            // [{ id, name, doc(PDFLib.PDFDocument), bytes(Uint8Array) }]
let pageOrder = [];       // 全局顺序：按当前 DOM 扫描得到 [{ f:fileId, p:pageIdx }]
let selected = new Set(); // 选中集合："fileId-pageIdx"
let rotationMap = {};     // 旋转角度映射：{ "fileId-pageIdx": angle }
let currentPage = null, currentFileId = null;
const MAX_UNIQUE_WM = 10, MAX_COUNT_PER_PAGE = 30;
let pendingWatermarks = [];
let fileCounter = 0;      // 自增 id

const THUMB_WIDTH = 220;  // 缩略图统一宽度，视觉更稳
const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

/* =========================
 *  上传（多选 + 拖拽）
 * ========================= */
const uploadBox = document.getElementById('uploadArea');
const picker = document.getElementById('pdfPicker');

// 点击选择
picker.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files).filter(f => f.type === 'application/pdf');
    if (!files.length) return;
    await loadFiles(files);
    picker.value = ''; // 允许选择相同文件
});

// 拖入/拖拽
['dragenter', 'dragover'].forEach(evt => {
    uploadBox.addEventListener(evt, (e) => { e.preventDefault(); uploadBox.style.opacity = .9; });
});
['dragleave', 'drop'].forEach(evt => {
    uploadBox.addEventListener(evt, (e) => { e.preventDefault(); uploadBox.style.opacity = 1; });
});
uploadBox.addEventListener('drop', async (e) => {
    const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
    if (!files.length) return;
    await loadFiles(files);
});

// 实际加载文件到内存并绘制一个“分组”
async function loadFiles(files) {
    for (const file of files) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const doc = await PDFLib.PDFDocument.load(bytes);
        const id = fileCounter++;

        // 写入全局数组
        docs.push({ id, name: file.name, doc, bytes });

        // 初始化旋转映射
        for (let i = 0; i < doc.getPageCount(); i++) {
            const key = `${id}-${i}`;
            if (!(key in rotationMap)) rotationMap[key] = 0;
        }

        // 只渲染这个新文件的分组（避免全量刷新造成闪屏）
        await renderOneGroup(id);
    }

    // 刷新一次全局顺序
    rebuildOrder();
}

/* =========================
 *  预览渲染（按文件分组）
 *  - renderOneGroup(id): 新增/重绘某个文件组
 *  - rebuildOrder(): 从 DOM 扫描 pageOrder
 * ========================= */
async function renderOneGroup(fileId) {
    const container = document.getElementById('preview');
    const file = getDocById(fileId);
    if (!file) return;

    // 若该组已存在，做“就地重绘”网格；否则创建整组
    let group = document.querySelector(`.pdf-group[data-file-id="${fileId}"]`);
    let grid;

    if (!group) {
        group = document.createElement('div');
        group.className = 'pdf-group';
        group.dataset.fileId = fileId;

        const header = document.createElement('div');
        header.className = 'pdf-header';
        header.innerHTML = `
      <span>📄 ${file.name}</span>
      <button class="del-file-btn" title="删除该 PDF" onclick="removePdf(${fileId})">删除该文件</button>
    `;
        group.appendChild(header);

        grid = document.createElement('div');
        grid.className = 'preview-grid';
        grid.dataset.fileId = fileId; // 供 Sortable onAdd 判断“跨组移动”
        group.appendChild(grid);

        container.appendChild(group);

        // 给这个 grid 启用拖拽（允许跨组）
        enableSortable(grid);
    } else {
        grid = group.querySelector('.preview-grid');
        grid.innerHTML = ''; // 就地清空，避免整页闪
    }

    // 用 pdf.js 渲染缩略图（统一按“固定宽度”缩放）
    // --------------------------------------------------------------------------------------------------------
    const pdf = await pdfjsLib.getDocument({ data: file.bytes.slice(0) }).promise;
    // --------------------------------------------------------------------------------------------------------

    for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);

        // 先拿 1 倍 viewport，算出等比缩放倍数，再生成缩略图画布
        const base = page.getViewport({ scale: 1 });
        const scale = THUMB_WIDTH / base.width;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;  // 缩略图像素尺寸
        canvas.height = viewport.height;

        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

        const wrap = document.createElement('div');
        wrap.className = 'page-wrapper';
        wrap.dataset.fileId = fileId;
        wrap.dataset.pageIdx = p - 1;
        wrap.appendChild(canvas);




        // 双击缩略图也能打开
        canvas.ondblclick = () => openPreview(fileId, p - 1);




        const badge = document.createElement('div');
        badge.className = 'page-number';
        badge.textContent = p; // 显示该文档内页码
        wrap.appendChild(badge);

        // 如果此页有旋转记录，预览也转一下
        const key = `${fileId}-${p - 1}`;
        const ang = rotationMap[key] || 0;
        if (ang) canvas.style.transform = `rotate(${ang}deg)`;

        wrap.onclick = () => toggleSelect(wrap);
        grid.appendChild(wrap);
    }
}

// 启用/复用 Sortable（每个 grid 一套）
function enableSortable(gridEl) {
    const s = Sortable.create(gridEl, {
        group: 'pdf-pages',
        animation: 150,
        draggable: '.page-wrapper',
        ghostClass: 'drag-ghost',

        // 跨组放下时触发：把“跨文件移动”的页面立刻“脱离源文件”
        onAdd: async (evt) => {
            const item = evt.item; // 被拖的 .page-wrapper
            const oldF = parseInt(item.dataset.fileId, 10);
            const oldP = parseInt(item.dataset.pageIdx, 10);
            const newGroupFileId = parseInt(evt.to.dataset.fileId, 10); // 目标组的 fileId

            if (oldF !== newGroupFileId) {
                // —— 关键：立刻把这张页复制为“独立 PDF”，并让该缩略图改指向“新文档”
                const newFileId = await detachOnePageAsNewDoc(oldF, oldP);

                // 更新该缩略图绑定
                item.dataset.fileId = newFileId;
                item.dataset.pageIdx = 0;
                // 徽标重新显示为 1
                const badge = item.querySelector('.page-number');
                if (badge) badge.textContent = 1;

                // 选中集合里的旧 key 也要替换
                const oldKey = `${oldF}-${oldP}`;
                const newKey = `${newFileId}-0`;
                if (selected.has(oldKey)) { selected.delete(oldKey); selected.add(newKey); }

                // 旋转继承
                rotationMap[newKey] = rotationMap[oldKey] || 0;

                // 小心：旧 key 可以保留（不影响），也可删除（无所谓）
                // delete rotationMap[oldKey];
            }
            rebuildOrder(); // 重新扫描 DOM 顺序
        },

        // 同组内拖放
        onEnd: rebuildOrder
    });

    // 记到全局，后续若要销毁可以统一处理（本版本用不到）
    window._sortables ??= [];
    window._sortables.push(s);
}

// 从 DOM 扫描全局顺序（避免维护复杂的中间态）
function rebuildOrder() {
    const nodes = document.querySelectorAll('#preview .page-wrapper');
    pageOrder = Array.from(nodes).map(el => ({
        f: parseInt(el.dataset.fileId, 10),
        p: parseInt(el.dataset.pageIdx, 10)
    }));
}

/* =========================
 *  删除单个 PDF 文件（分组上的按钮）
 * ========================= */
async function removePdf(fileId) {
    // 1) 删内存
    docs = docs.filter(d => d.id !== fileId);

    // 2) 删选中状态和旋转映射相关 key
    selected = new Set([...selected].filter(k => !k.startsWith(fileId + "-")));
    const newRot = {};
    Object.keys(rotationMap).forEach(k => {
        if (!k.startsWith(fileId + "-")) newRot[k] = rotationMap[k];
    });
    rotationMap = newRot;

    // 3) 删 DOM 中对应组（就地，不刷新其它）
    const group = document.querySelector(`.pdf-group[data-file-id="${fileId}"]`);
    if (group) group.remove();

    // 4) 重建顺序
    rebuildOrder();
}

/* =========================
 *  选中/全选
 * ========================= */
function toggleSelect(el) {
    const key = `${el.dataset.fileId}-${el.dataset.pageIdx}`;
    if (selected.has(key)) { selected.delete(key); el.classList.remove('selected'); }
    else { selected.add(key); el.classList.add('selected'); }
}
document.getElementById('selectAllToggle').addEventListener('change', (e) => {
    const checked = e.target.checked;
    const items = document.querySelectorAll('#preview .page-wrapper');
    selected.clear();
    items.forEach(el => {
        const key = `${el.dataset.fileId}-${el.dataset.pageIdx}`;
        if (checked) { selected.add(key); el.classList.add('selected'); }
        else { el.classList.remove('selected'); }
    });
});

/* =========================
 *  删除所选页（就地更新每个文件分组，不卡屏）
 * ========================= */
async function deletePages() {
    if (!docs.length) return alert('请先上传 PDF！');
    if (!selected.size) return alert('请选择要删除的页面！');

    // 把选中项按 fileId 聚合
    const picksByFile = new Map(); // fileId -> Set(pageIdx)
    selected.forEach(k => {
        const [fid, pi] = k.split('-').map(Number);
        if (!picksByFile.has(fid)) picksByFile.set(fid, new Set());
        picksByFile.get(fid).add(pi);
    });

    // 逐个文件做“就地更新”
    for (const [fid, pickSet] of picksByFile.entries()) {
        const d = getDocById(fid);
        if (!d) continue;

        const oldDoc = d.doc;
        const indices = oldDoc.getPageIndices(); // [0..n-1]
        const keep = indices.filter(i => !pickSet.has(i));

        if (keep.length === 0) {
            // 该文件所有页都被删：等价于删除整个文件分组
            await removePdf(fid);
            continue;
        }

        // 复制保留页到新文档
        const out = await PDFLib.PDFDocument.create();
        const copied = await out.copyPages(oldDoc, keep);
        copied.forEach(p => out.addPage(p));
        const newBytes = await out.save();

        // 回写内存
        d.bytes = newBytes;
        d.doc = await PDFLib.PDFDocument.load(newBytes);

        // 重建该文件的旋转映射（新索引 -> 旧 key）
        const newRotationForFile = {};
        keep.forEach((oldIdx, newIdx) => {
            const oldKey = `${fid}-${oldIdx}`;
            newRotationForFile[`${fid}-${newIdx}`] = rotationMap[oldKey] || 0;
        });
        // 合并到全局 rotationMap：先清本文件旧键，再写新键
        Object.keys(rotationMap).forEach(k => {
            if (k.startsWith(fid + '-')) delete rotationMap[k];
        });
        Object.assign(rotationMap, newRotationForFile);

        // 只重绘这个文件组（不卡屏）
        await renderOneGroup(fid);
    }

    // 清空已删除的选中项
    selected = new Set([...selected].filter(k => {
        const [fid] = k.split('-').map(Number);
        return !picksByFile.has(fid);
    }));

    // 重建全局顺序
    rebuildOrder();
}

/* =========================
 *  把某一页“脱离源文件”成独立 PDF（用于跨文件拖拽时保持不丢）
 *  返回新文件的 fileId
 * ========================= */
async function detachOnePageAsNewDoc(srcFileId, pageIdx) {
    const src = getDocById(srcFileId);
    if (!src) return srcFileId;

    const out = await PDFLib.PDFDocument.create();
    const [copied] = await out.copyPages(src.doc, [pageIdx]);
    out.addPage(copied);

    // 继承旋转
    const ang = rotationMap[`${srcFileId}-${pageIdx}`] || 0;
    if (ang) copied.setRotation(PDFLib.degrees(ang));

    const bytes = await out.save();
    const newDoc = await PDFLib.PDFDocument.load(bytes);
    const newId = fileCounter++;

    docs.push({ id: newId, name: `来自 ${src.name} 的页面`, doc: newDoc, bytes });
    rotationMap[`${newId}-0`] = ang || 0;

    // 也渲染一个“隐形”分组？——不需要。该页已经被拖入目标组的 DOM 里。
    // 但为了后续导出/顺序扫描，这个新文档必须存在于 docs（我们已 push）。
    return newId;
}

/* =========================
 *  拆分所选页为新 PDF（保留原文档）
 * ========================= */
async function splitPages() {
    if (!docs.length) return alert('请先上传 PDF！');
    if (!selected.size) return alert('请选择要拆分的页面！');

    const out = await PDFLib.PDFDocument.create();

    const orderSel = pageOrder.filter(item => selected.has(`${item.f}-${item.p}`));
    for (const item of orderSel) {
        const file = getDocById(item.f);
        if (!file) continue;
        const [page] = await out.copyPages(file.doc, [item.p]);
        out.addPage(page);
        const ang = rotationMap[`${item.f}-${item.p}`] || 0;
        if (ang) page.setRotation(PDFLib.degrees(ang));
    }
    await applyQueuedWatermarks(out);
    const bytes = await out.save();
    downloadBlob(bytes, 'splitted.pdf');
}

/* =========================
 *  合并所选（若无选中则合并全部）
 * ========================= */
async function mergeSelected() {
    if (!docs.length) return alert('请先上传 PDF！');
    const out = await PDFLib.PDFDocument.create();

    const hasSelection = selected.size > 0;
    const items = hasSelection ? pageOrder.filter(it => selected.has(`${it.f}-${it.p}`))
        : pageOrder.slice();

    if (!items.length) return alert('没有可合并的页面！');

    for (const it of items) {
        const file = getDocById(it.f);
        if (!file) continue;
        const [page] = await out.copyPages(file.doc, [it.p]);
        out.addPage(page);
        const ang = rotationMap[`${it.f}-${it.p}`] || 0;
        if (ang) page.setRotation(PDFLib.degrees(ang));
    }

    await applyQueuedWatermarks(out);
    const bytes = await out.save();
    downloadBlob(bytes, hasSelection ? 'merged-selected.pdf' : 'merged-all.pdf');
}

/* =========================
 *  旋转（记录 + 预览变换）
 * ========================= */
function rotateSelected(direction) {
    if (!docs.length) return alert('请先上传 PDF！');
    if (!selected.size) return alert('请选择要旋转的页面！');
    const delta = direction === 'left' ? -90 : direction === 'right' ? 90 : 180;

    selected.forEach(key => {
        rotationMap[key] = ((rotationMap[key] || 0) + delta) % 360;
        const [f, p] = key.split('-');
        const canvas = document.querySelector(`.page-wrapper[data-file-id="${f}"][data-page-idx="${p}"] canvas`);
        if (canvas) canvas.style.transform = `rotate(${rotationMap[key]}deg)`;
    });
}

/* =========================
 *  下载最终 PDF（按当前 DOM 顺序）
 * ========================= */
async function downloadFinal() {
    if (!docs.length) return alert('请先上传 PDF！');

    const out = await PDFLib.PDFDocument.create();
    for (const item of pageOrder) {
        const file = getDocById(item.f);
        if (!file) continue;
        const [page] = await out.copyPages(file.doc, [item.p]);
        out.addPage(page);
        const ang = rotationMap[`${item.f}-${item.p}`] || 0;
        if (ang) page.setRotation(PDFLib.degrees(ang));
    }
    await applyQueuedWatermarks(out);
    const bytes = await out.save();
    pendingWatermarks = []; updateWmInfo();
    downloadBlob(bytes, 'final.pdf');
}

/* =========================
 *  水印：配置 & 应用
 * ========================= */
function normalizeCfg(text, count, size, opacity, color) {
    const t = (text || '').replace(/\r?\n|\r/g, '').trim() || 'Huishao.net';
    const c = Math.min(MAX_COUNT_PER_PAGE, Math.max(1, parseInt(count) || 1));
    const s = Math.min(160, Math.max(8, parseInt(size) || 24));
    const o = Math.min(1, Math.max(0.05, parseFloat(opacity) || 0.5));
    const col = color || '#bfbfbf';
    return { text: t, count: c, size: s, opacity: o, color: col, key: JSON.stringify({ t, s, o, col }) };
}
function queueCustomWatermark() {
    if (pendingWatermarks.length >= MAX_UNIQUE_WM) {
        return alert(`最多支持 ${MAX_UNIQUE_WM} 组不同样式的水印`);
    }
    const cfg = normalizeCfg(
        document.getElementById('watermarkText').value,
        document.getElementById('watermarkCount').value,
        document.getElementById('watermarkSize').value,
        document.getElementById('watermarkOpacity').value,
        document.getElementById('watermarkColor').value
    );
    const exist = pendingWatermarks.find(w => w.key === cfg.key);
    if (exist) exist.count = Math.min(MAX_COUNT_PER_PAGE, exist.count + cfg.count);
    else pendingWatermarks.push(cfg);
    updateWmInfo();
    alert(`✅ 已加入：${cfg.text}（${cfg.size}px, 透明度 ${cfg.opacity}, 每页 ${cfg.count} 个）`);
}
function clearWatermarkQueue() {
    pendingWatermarks = [];
    updateWmInfo();
    alert('已清空水印队列。');
}
function updateWmInfo() {
    const totalStyles = pendingWatermarks.length;
    const totalPerPage = pendingWatermarks.reduce((s, w) => s + w.count, 0);
    document.getElementById('wmInfo').innerText = `当前待应用水印：${totalStyles} 组（合计每页 ${totalPerPage} 个，最高 ${MAX_COUNT_PER_PAGE}）`;
}

// 文字转 PNG（带旋转 30° 的水印切片）
function createWatermarkImage(text, size, color, opacity) {
    const measurer = document.createElement('canvas').getContext('2d');
    measurer.font = `bold ${size}px system-ui,-apple-system,Segoe UI,Roboto,Noto Sans,"Helvetica Neue",Arial,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif`;
    const textW = Math.ceil(measurer.measureText(text).width);
    const textH = Math.ceil(size * 1.2);
    const pad = Math.ceil(size * 0.8);
    const theta = Math.PI / 6; // 30°
    const w = textW + pad * 2, h = textH + pad * 2;
    const rotW = Math.ceil(Math.abs(w * Math.cos(theta)) + Math.abs(h * Math.sin(theta)));
    const rotH = Math.ceil(Math.abs(w * Math.sin(theta)) + Math.abs(h * Math.cos(theta)));
    const cw = Math.max(220, rotW), ch = Math.max(120, rotH);

    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);
    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    ctx.font = measurer.font;
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate(-theta);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    return canvas.toDataURL('image/png');
}

// 将当前队列水印真正绘制到 pdfDoc
async function applyQueuedWatermarks(pdfDoc) {
    if (!pendingWatermarks.length) return;
    const embedded = new Map();
    for (const cfg of pendingWatermarks) {
        if (embedded.has(cfg.key)) continue;
        const dataUrl = createWatermarkImage(cfg.text, cfg.size, cfg.color, cfg.opacity);
        const img = await pdfDoc.embedPng(dataUrl);
        embedded.set(cfg.key, img);
    }
    const pages = pdfDoc.getPages();
    for (const p of pages) {
        const { width, height } = p.getSize();
        let left = MAX_COUNT_PER_PAGE;
        for (const cfg of pendingWatermarks) {
            const img = embedded.get(cfg.key);
            if (!img) continue;
            const times = Math.min(cfg.count, left);
            left -= times;
            const w = cfg.size * 9, h = cfg.size * 3.6;
            for (let i = 0; i < times; i++) {
                const x = Math.random() * (width - w - 20) + 10;
                const y = Math.random() * (height - h - 20) + 10;
                p.drawImage(img, { x, y, width: w, height: h });
            }
            if (left <= 0) break;
        }
    }
}

/* =========================
 *  工具函数
 * ========================= */
function getDocById(fileId) { return docs.find(d => d.id === fileId); }

function downloadBlob(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}






/* ========== 放大预览 + 画笔 ========== */
const modal = document.getElementById('modal');
const viewCanvas = document.getElementById('viewCanvas');
const drawCanvas = document.getElementById('drawCanvas');
const vctx = viewCanvas.getContext('2d');
const dctx = drawCanvas.getContext('2d');
// document.getElementById('closeBtn').onclick=()=>modal.style.display="none";
modal.onclick = e => { if (e.target === modal) modal.style.display = "none"; }



// 打开大图
async function openPreview(fileId, pageIdx) {
    currentFileId = fileId;
    currentPage = pageIdx;
    const file = getDocById(fileId); if (!file) return;
    const pdf = await pdfjsLib.getDocument({ data: file.bytes.slice(0) }).promise;
    const page = await pdf.getPage(pageIdx + 1);

    // 计算缩放比例，确保页面适配窗口宽度
    const viewport = page.getViewport({ scale: 1 });
    const maxWidth = window.innerWidth * 0.8;   // 最大 80% 屏幕宽度
    const maxHeight = window.innerHeight * 0.8; // 最大 80% 屏幕高度
    let scale = Math.min(maxWidth / viewport.width, maxHeight / viewport.height);

    const scaledViewport = page.getViewport({ scale });
    viewCanvas.width = scaledViewport.width;
    viewCanvas.height = scaledViewport.height;
    drawCanvas.width = scaledViewport.width;
    drawCanvas.height = scaledViewport.height;
    dctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    await page.render({ canvasContext: vctx, viewport: scaledViewport }).promise;
    modal.style.display = "flex";
}


// 绘图逻辑
let drawing = false, lastPos = null;
function getPos(e) {
    const rect = drawCanvas.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left) * (drawCanvas.width / rect.width),
        y: (e.clientY - rect.top) * (drawCanvas.height / rect.height)
    };
}
drawCanvas.addEventListener('mousedown', e => { drawing = true; lastPos = getPos(e); });
drawCanvas.addEventListener('mousemove', e => {
    if (!drawing) return;
    const pos = getPos(e);
    dctx.strokeStyle = document.getElementById('color').value;
    dctx.lineWidth = document.getElementById('size').value;
    dctx.lineCap = 'round';
    dctx.beginPath(); dctx.moveTo(lastPos.x, lastPos.y); dctx.lineTo(pos.x, pos.y); dctx.stroke();
    lastPos = pos;
});
['mouseup', 'mouseleave'].forEach(ev => drawCanvas.addEventListener(ev, () => drawing = false));
function clearDraw() { dctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height); }

function savePNG() {
    const merged = document.createElement('canvas');
    merged.width = viewCanvas.width; merged.height = viewCanvas.height;
    const mctx = merged.getContext('2d');
    mctx.drawImage(viewCanvas, 0, 0);
    mctx.drawImage(drawCanvas, 0, 0);
    const link = document.createElement('a');
    link.href = merged.toDataURL("image/png");
    link.download = `pdf-${currentFileId}-page-${currentPage + 1}.png`;
    link.click();
}



async function applyDrawToPdf() {
    if (currentFileId == null || currentPage == null) return;
    const file = getDocById(currentFileId); if (!file) return;

    // 把 drawCanvas 导出为 PNG
    const dataUrl = drawCanvas.toDataURL("image/png");
    const img = await file.doc.embedPng(dataUrl);

    const page = file.doc.getPage(currentPage);
    const { width, height } = page.getSize();

    // 让标注图片覆盖整个页面（和 viewCanvas 尺寸一致）
    page.drawImage(img, { x: 0, y: 0, width, height });

    // 保存并更新 file.bytes
    const newBytes = await file.doc.save();
    file.bytes = newBytes;
    file.doc = await PDFLib.PDFDocument.load(newBytes);

    // 重绘该文件组（更新缩略图）
    await renderOneGroup(currentFileId);

    // 清空标注层
    dctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

    alert("✅ 标注已应用到 PDF");
}

