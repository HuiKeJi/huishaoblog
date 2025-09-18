// 动态加载 UPNG，多源兜底
async function ensureUPNG() {
    if (window.UPNG) return true;

    const urls = [
        'https://cdn.jsdelivr.net/npm/upng-js@2.1.0/UPNG.js',
        'https://unpkg.com/upng-js@2.1.0/UPNG.js',
        'https://fastly.jsdelivr.net/npm/upng-js@2.1.0/UPNG.js'
    ];

    for (const url of urls) {
        try {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = url;
                s.onload = resolve;
                s.onerror = () => reject(new Error('load fail: ' + url));
                document.head.appendChild(s);
            });
            if (window.UPNG) return true;
        } catch (_) { }
    }
    return false;
}

// 质量(0.1~1) 映射到颜色数(2~256) —— UPNG 的“colors”越小越省
function qualityToColors(q) {
    q = Math.max(0.1, Math.min(1, q));
    return Math.min(256, Math.max(2, Math.round(16 + q * 240)));
}

/* ===== DOM 元素 ===== */
const upload = document.getElementById('upload');
const dropZone = document.getElementById('dropZone');
const previewList = document.getElementById('previewList');
const icoPreview = document.getElementById('icoPreview');
const enableCompress = document.getElementById('enableCompress');
const qualityBox = document.getElementById('qualityBox');
const qualityInput = document.getElementById('quality');
const qval = document.getElementById('qval');
const downloadAll = document.getElementById('downloadAll');
const clearAll = document.getElementById('clearAll');
const compareSection = document.getElementById('compareSection');
const compareList = document.getElementById('compareList');

/* ===== 状态 ===== */
let filesData = [];

/* ===== 工具函数 ===== */
function loadImage(src) { return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = src; }); }
function dataUrlBytes(d) { const b64 = (d.split(',')[1] || ''); const pad = (b64.endsWith('==') ? 2 : (b64.endsWith('=') ? 1 : 0)); return Math.floor(b64.length * 3 / 4) - pad; }
function fmtBytes(n) { if (!n && n !== 0) return '-'; const u = ['B', 'KB', 'MB']; let i = 0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return (Math.round(n * 10) / 10) + ' ' + u[i]; }
async function getDim(data) { const img = await loadImage(data); return { w: img.width, h: img.height }; }
function toggleButtons() { const has = filesData.length > 0; clearAll.style.display = has ? "inline-block" : "none"; downloadAll.style.display = has ? "inline-block" : "none"; }

/* ===== 文件处理 & 预览 ===== */
function handleFiles(files) {
    for (let file of files) {
        if (!file.type.startsWith('image/')) continue;
        const reader = new FileReader();
        reader.onload = async ev => {
            const data = ev.target.result;
            const dim = await getDim(data);
            const fileObj = {
                name: file.name,
                originalType: file.type,
                originalData: data,
                dataURL: data,
                convertedData: null,
                width: dim.w,
                height: dim.h
            };
            filesData.push(fileObj);
            showPreview(fileObj);
            toggleButtons();
        };
        reader.readAsDataURL(file);
    }
    upload.value = "";
}


function getExtFromDataURL(u) {
    const m = /^data:image\/(png|jpeg|webp)/.exec(u || "");
    if (!m) return "png";
    return m[1] === "jpeg" ? "jpg" : m[1];
}

function updateMeta(file) {
    if (!file?.element) return;
    const metaEl = file.element.querySelector('.meta');
    metaEl.textContent = `${file.width}×${file.height}, ${fmtBytes(dataUrlBytes(file.dataURL))}`;
}

function showPreview(file) {
    const div = document.createElement('div');
    div.className = 'preview-item';

    div.innerHTML = `
      <div class="card-toolbar">
        <button class="btn btn-download" title="下载">⬇</button>
        <button class="btn btn-remove" title="移除">×</button>
      </div>
      <div class="thumb"><img alt="preview"></div>
      <p class="filename"></p>
      <div class="meta">读取中...</div>
    `;

    previewList.appendChild(div);
    file.element = div;

    div.querySelector('.filename').textContent = file.name;

    const imgTag = div.querySelector('img');
    imgTag.onload = () => updateMeta(file);
    imgTag.src = file.dataURL;

    // 删除（阻止冒泡，避免点按钮打开编辑器）
    div.querySelector('.btn-remove').onclick = (ev) => {
        ev.stopPropagation();
        previewList.removeChild(div);
        filesData = filesData.filter(f => f !== file);
        toggleButtons();
    };

    // 单张下载（下载当前 dataURL，即编辑后的样子）
    div.querySelector('.btn-download').onclick = (ev) => {
        ev.stopPropagation();
        const a = document.createElement('a');
        a.href = file.dataURL;
        const ext = getExtFromDataURL(file.dataURL);
        a.download = file.name.replace(/\.[^.]+$/, "") + "_edited." + ext;
        a.click();
    };
}

enableCompress.addEventListener('change', () => { qualityBox.style.display = enableCompress.checked ? "block" : "none"; });
qualityInput.addEventListener('input', () => qval.textContent = qualityInput.value);

// ========== 转换功能 ==========
async function convertAll() {
    if (filesData.length === 0) return alert("请先上传至少一张图片！");
    const zip = new JSZip();
    compareList.innerHTML = "";
    compareSection.style.display = "block";

    for (let file of filesData) {
        const before = file.dataURL;
        const img = await loadImage(before);

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);

        // 获取用户选择的目标格式
        const mime = document.getElementById("format").value || "image/png";
        const newData = canvas.toDataURL(mime);
        file.convertedData = newData;
        file.dataURL = newData;

        // === 对比区 ===
        const block = document.createElement('div');
        block.className = "compare-block";

        // 左：原图
        const left = document.createElement('div');
        left.className = "img-wrapper";
        left.innerHTML = "<p>原图</p>";
        const img1 = new Image();
        img1.src = before;
        const btn1 = document.createElement("button");
        btn1.className = "download-btn";
        btn1.innerHTML = "⬇";
        btn1.onclick = () => {
            const a = document.createElement("a");
            a.href = img1.src;
            const ext1 = file.originalType.split('/')[1] === 'jpeg' ? 'jpg' : file.originalType.split('/')[1];
            a.download = file.name.replace(/\.[^.]+$/, "") + "_original." + ext1;
            a.click();
        };
        left.appendChild(img1);
        left.appendChild(btn1);

        // 右：转换后
        const right = document.createElement('div');
        right.className = "img-wrapper";

        let extLabel = mime.split('/')[1].toUpperCase();
        if (extLabel === "JPEG") extLabel = "JPG";
        right.innerHTML = `<p>${extLabel} 后</p>`;

        const img2 = new Image();
        img2.src = newData;
        const btn2 = document.createElement("button");
        btn2.className = "download-btn";
        btn2.innerHTML = "⬇";
        btn2.onclick = () => {
            const a = document.createElement("a");
            a.href = newData;
            const ext2 = mime.split('/')[1] === 'jpeg' ? 'jpg' : mime.split('/')[1];
            a.download = file.name.replace(/\.[^.]+$/, "") + "_converted." + ext2;
            a.click();
        };
        right.appendChild(img2);
        right.appendChild(btn2);

        block.appendChild(left);
        block.appendChild(right);
        compareList.appendChild(block);

        // 打包进 zip
        const ext = mime.split('/')[1] === 'jpeg' ? 'jpg' : mime.split('/')[1];
        const fname = file.name.replace(/\.[^.]+$/, '') + "_converted." + ext;
        zip.file(fname, newData.split(',')[1], { base64: true });
    }

    // 打包下载按钮
    downloadAll.onclick = async () => {
        const content = await zip.generateAsync({ type: 'blob' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = "converted_images.zip";
        a.click();
    };
}



// ========== 压缩功能 ==========
async function compressAll() {
    try {
        if (!enableCompress.checked) {
            alert("请先勾选【启用压缩】！");
            return;
        }
        if (filesData.length === 0) {
            alert("请先上传至少一张图片！");
            return;
        }

        const zip = new JSZip();
        compareList.innerHTML = "";
        compareSection.style.display = "block";
        let upngReady = false;

        for (let file of filesData) {
            const before = file.dataURL;
            const img = await loadImage(before);

            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            const mime = file.originalType || 'image/png';
            const q = parseFloat(qualityInput.value) || 0.8;

            let newData, ext;

            if (mime === 'image/png') {
                if (!upngReady) upngReady = await ensureUPNG();
                if (upngReady && window.UPNG?.encode) {
                    const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const colors = qualityToColors(q);
                    const ab = UPNG.encode([id.data.buffer], canvas.width, canvas.height, colors);
                    const blob = new Blob([ab], { type: 'image/png' });
                    newData = await new Promise(res => {
                        const fr = new FileReader();
                        fr.onload = () => res(fr.result);
                        fr.readAsDataURL(blob);
                    });
                    ext = 'png';
                } else {
                    newData = canvas.toDataURL('image/png');
                    ext = 'png';
                }
            } else {
                newData = canvas.toDataURL(mime, q);
                ext = mime.split('/')[1] === 'jpeg' ? 'jpg' : mime.split('/')[1];
            }

            file.convertedData = newData;
            file.dataURL = newData;

            // === 对比区 ===
            const block = document.createElement('div');
            block.className = 'compare-block';

            // 左：原图
            const left = document.createElement('div');
            left.className = 'img-wrapper';
            left.innerHTML = '<p>原图</p>';
            const img1 = new Image();
            img1.src = before;
            const btn1 = document.createElement('button');
            btn1.className = 'download-btn';
            btn1.innerHTML = '⬇';
            btn1.onclick = () => {
                const a = document.createElement('a');
                a.href = before;
                const ext1 = file.originalType.split('/')[1] === 'jpeg' ? 'jpg' : file.originalType.split('/')[1];
                a.download = file.name.replace(/\.[^.]+$/, '') + '_original.' + ext1;
                a.click();
            };
            left.appendChild(img1);
            left.appendChild(btn1);

            // 右：压缩后
            const right = document.createElement('div');
            right.className = 'img-wrapper';
            right.innerHTML = '<p>压缩后</p>';
            const img2 = new Image();
            img2.src = newData;
            const btn2 = document.createElement('button');
            btn2.className = 'download-btn';
            btn2.innerHTML = '⬇';
            btn2.onclick = () => {
                const a = document.createElement('a');
                a.href = newData;
                a.download = file.name.replace(/\.[^.]+$/, '') + '_compressed.' + ext;
                a.click();
            };
            right.appendChild(img2);
            right.appendChild(btn2);

            block.appendChild(left);
            block.appendChild(right);
            compareList.appendChild(block);

            const fname = file.name.replace(/\.[^.]+$/, '') + '_compressed.' + ext;
            zip.file(fname, newData.split(',')[1], { base64: true });
        }

        downloadAll.onclick = async () => {
            const content = await zip.generateAsync({ type: 'blob' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(content);
            a.download = 'compressed_images.zip';
            a.click();
        };
    } catch (err) {
        console.error(err);
        alert('压缩失败：' + (err?.message || err));
    }
}


// 把 dataURL 转成 Uint8Array
function dataURLtoUint8(dataURL) {
    const b64 = dataURL.split(',')[1] || '';
    const bin = atob(b64);
    const len = bin.length;
    const u8 = new Uint8Array(len);
    for (let i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
    return u8;
}

// 生成一个多尺寸 PNG 的 .ico Blob
async function buildICOFromPNGDataURLs(pngItems) {
    // pngItems: [{size:number, data:Uint8Array}, ...]  按任意顺序
    const count = pngItems.length;

    // 计算每个图像的起始偏移：6字节头 + 16*count 目录
    let offset = 6 + 16 * count;
    const entries = [];

    // 目录项（ICONDIRENTRY）16字节
    for (const it of pngItems) {
        const widthByte = (it.size >= 256) ? 0 : it.size; // 256 -> 0
        const heightByte = (it.size >= 256) ? 0 : it.size;

        entries.push({
            widthByte,
            heightByte,
            colors: 0, // 0=无调色板
            reserved: 0,
            planes: 1,      // 常填1
            bitCount: 32,   // 常填32；PNG 实际位深由数据决定，这里目录值习惯填32
            bytesInRes: it.data.length,
            imageOffset: offset
        });
        offset += it.data.length;
    }

    // 写 ICONDIR（6字节）
    const header = new ArrayBuffer(6);
    const dvh = new DataView(header);
    dvh.setUint16(0, 0, true);    // reserved
    dvh.setUint16(2, 1, true);    // type=1 (icon)
    dvh.setUint16(4, count, true);// count

    // 写 ICONDIRENTRY 表
    const dirTable = new ArrayBuffer(16 * count);
    const dvd = new DataView(dirTable);
    for (let i = 0; i < count; i++) {
        const e = entries[i];
        const p = i * 16;
        dvd.setUint8(p + 0, e.widthByte);
        dvd.setUint8(p + 1, e.heightByte);
        dvd.setUint8(p + 2, e.colors);
        dvd.setUint8(p + 3, e.reserved);
        dvd.setUint16(p + 4, e.planes, true);
        dvd.setUint16(p + 6, e.bitCount, true);
        dvd.setUint32(p + 8, e.bytesInRes, true);
        dvd.setUint32(p + 12, e.imageOffset, true);
    }

    // 拼接：header + dirTable + 所有 PNG 数据
    const parts = [new Uint8Array(header), new Uint8Array(dirTable)];
    for (const it of pngItems) parts.push(it.data);

    return new Blob(parts, { type: "image/x-icon" });
}


// 强制 ICO 尺寸只能单选（不论是 checkbox 还是 radio）
(function () {
    const group = document.getElementById('icoSizeGroup');
    if (!group) return;

    const inputs = group.querySelectorAll('input[name="icoSize"]');

    inputs.forEach(input => {
        input.addEventListener('change', (e) => {
            if (e.target.checked) {
                // 取消其它所有
                inputs.forEach(other => {
                    if (other !== e.target) other.checked = false;
                });
            }
        });
    });

    // 如果需要：提供一个获取选中尺寸的函数
    window.getSelectedIcoSize = function () {
        const sel = group.querySelector('input[name="icoSize"]:checked');
        return sel ? parseInt(sel.value, 10) : null;
    };
})();




// 真正的“转换为 ICO”
async function convertToICO() {
    if (filesData.length === 0) return alert("请先上传至少一张图片！");

    // 单选尺寸
    const size = getSelectedIcoSize?.();
    if (!size) {
        alert("请先选择一个 ICON 尺寸！");
        return;
    }

    // 预览清空
    icoPreview.innerHTML = "";

    // 多文件逐个生成 .ico
    for (const file of filesData) {
        const srcImg = await loadImage(file.dataURL);

        // 创建一个 canvas
        const c = document.createElement("canvas");
        c.width = size;
        c.height = size;
        const ctx = c.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(srcImg, 0, 0, size, size);

        // PNG 数据
        const dataURL = c.toDataURL("image/png");
        const u8 = dataURLtoUint8(dataURL);

        // 组装 ICO —— 只用一个尺寸
        const icoBlob = await buildICOFromPNGDataURLs([{ size, data: u8 }]);

        // 预览
        const box = document.createElement("div");
        box.style.margin = "14px 0";
        box.innerHTML = `<div style="font-size:12px;color:#666;margin-bottom:6px;">${file.name} (${size}x${size}) 预览：</div>`;
        icoPreview.appendChild(box);

        const preview = new Image();
        preview.src = dataURL;
        preview.width = size;
        preview.height = size;
        preview.style.border = "1px solid #ddd";
        box.appendChild(preview);

        // 下载
        const a = document.createElement("a");
        a.href = URL.createObjectURL(icoBlob);
        a.download = file.name.replace(/\.[^.]+$/, "") + ".ico";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}

/* ===== 点击放大/缩小 ===== */
document.addEventListener('click', e => {
    if (e.target.tagName === "IMG" && e.target.closest('.compare-block')) {
        if (e.target.style.maxHeight === "none") {
            e.target.style.maxHeight = "400px";
            e.target.style.cursor = "zoom-in";
        } else {
            e.target.style.maxHeight = "none";
            e.target.style.cursor = "zoom-out";
        }
    }
});

/* ===== 编辑器：坐标修正 ===== */
function getCanvasPos(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
}




// 图片编辑
function openEditor(file) {
    // ===== 创建 overlay + panel 并加入 DOM =====
    const overlay = document.createElement('div');
    overlay.id = "editorOverlay";

    const panel = document.createElement('div');
    panel.id = "editorPanel";
    overlay.appendChild(panel);

    // ===== 画布 =====
    const canvas = document.createElement('canvas');
    canvas.id = "editorCanvas";
    canvas.style.visibility = "hidden"; // 初始隐藏，避免闪烁
    const ctx = canvas.getContext('2d');
    panel.appendChild(canvas);

    // ===== 载入图片到画布 =====
    const img = new Image();
    let originalData = null;

    // 圆角方案一
    // img.onload = () => {
    //     canvas.width = img.width;
    //     canvas.height = img.height;
    //     ctx.clearRect(0, 0, canvas.width, canvas.height);
    //     ctx.drawImage(img, 0, 0);
    //     canvas.style.visibility = "visible";
    //     originalData = canvas.toDataURL();
    //     saveState(); // 初始状态入历史
    // };

    // 圆角方案二
    // img.onload = () => {
    //     canvas.width = img.width;
    //     canvas.height = img.height;
    //     ctx.drawImage(img, 0, 0);
    //     canvas.style.visibility = "visible";
    //     originalData = canvas.toDataURL();
    //     saveState();

    //     // ✅ 自动设置最大圆角半径 = 最小边的一半
    //     const roundSlider = toolbar.querySelector('#roundRadius');
    //     roundSlider.max = Math.floor(Math.min(img.width, img.height) / 2);
    // };

    // 圆角方案三
    // img.onload = () => {
    //     // 1. 原始大小
    //     canvas.width = img.width;
    //     canvas.height = img.height;

    //     // 2. 计算缩放比例：最长边不超过 800px（你可以改成 1000/1200）
    //     const maxSide = 800;
    //     let scale = 1;
    //     if (img.width > maxSide || img.height > maxSide) {
    //         scale = maxSide / Math.max(img.width, img.height);
    //     }

    //     // 3. 只缩放显示，不拉伸变形
    //     canvas.style.width = (img.width * scale) + "px";
    //     canvas.style.height = (img.height * scale) + "px";

    //     // 4. 绘制图片
    //     ctx.drawImage(img, 0, 0);

    //     canvas.style.visibility = "visible";
    //     originalData = canvas.toDataURL();
    //     saveState();
    // };

    // 圆角方案四
    // img.onload = () => {
    //     canvas.width = img.width;
    //     canvas.height = img.height;
    //     ctx.drawImage(img, 0, 0);
    //     canvas.style.visibility = "visible";
    //     originalData = canvas.toDataURL();
    //     saveState();

    //     // ✅ 圆角滑块最大值 = 最短边的一半
    //     const roundSlider = toolbar.querySelector('#roundRadius');
    //     roundSlider.max = Math.min(canvas.width, canvas.height) / 2;
    // };

    // 圆角方案五
    img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        canvas.style.visibility = "visible";
        originalData = canvas.toDataURL();
        saveState();

        // ✅ 限制显示大小，不改原始分辨率
        const maxSide = window.innerWidth < 768 ? 400 : 800; // 手机最大 400px，PC 最大 800px
        let scale = 1;
        if (img.width > maxSide || img.height > maxSide) {
            scale = maxSide / Math.max(img.width, img.height);
        }
        canvas.style.width = (img.width * scale) + "px";
        canvas.style.height = (img.height * scale) + "px";

        // ✅ 设置圆角滑块最大值
        const roundSlider = toolbar.querySelector('#roundRadius');
        roundSlider.max = Math.min(canvas.width, canvas.height) / 2;

        // ✅ 在这里再调用
        enhanceSliders(toolbar);
    };



    img.src = file.dataURL;

    // ===== 工具栏（HTML） =====
    const toolbar = document.createElement('div');
    toolbar.id = "editorToolbar";
    toolbar.innerHTML = `
        <!-- 基础操作 -->
        <div class="toolbar-row">
            <h4>✂️ 基础操作</h4>
            <button id="cropTool">裁剪</button>
            <button id="mosaicTool">马赛克</button>
            <button id="penTool">画笔</button>
            <input type="color" id="penColor" value="#ff0000">
            <label class="slider-label">粗细 <input type="range" id="penSize" min="2" max="40" value="5"></label>
        </div>

        <!-- 滤镜 / 圆角 -->
        <div class="toolbar-row">
            <h4>🎨 滤镜 / 圆角</h4>
            <button id="roundTool">圆角（确认）</button>
            <label class="slider-label">半径 <input type="range" id="roundRadius" min="0" value="30"></label>
            <label>背景
            <select id="roundBgMode">
                <option value="transparent">透明</option>
                <option value="color">颜色</option>
            </select>
            </label>
            <input type="color" id="roundBgColor" value="#ffffff" disabled>
            <button id="applyFilter">应用滤镜（确认）</button>
            <label class="slider-label">亮度 <input type="range" id="filterBrightness" min="50" max="150" value="100"></label>
            <label class="slider-label">对比度 <input type="range" id="filterContrast" min="50" max="150" value="100"></label>
            <label class="slider-label">模糊 <input type="range" id="filterBlur" min="0" max="10" value="0"></label>
        </div>

        <!-- 水印 -->
        <div class="toolbar-row">
            <h4>📝 水印</h4>
            <input type="text" id="wmText" placeholder="输入水印文字" value="Huishao笔记" style="min-width:160px;">
            <label class="slider-label">字号 <input type="range" id="wmSize" min="10" max="80" value="30"></label>
            <input type="color" id="wmColor" value="#ffffff">
            <label class="slider-label">X轴 <input type="range" id="wmX" min="0" max="100" value="50"></label>
            <label class="slider-label">Y轴 <input type="range" id="wmY" min="0" max="100" value="50"></label>
            <button id="applyWatermark">应用文字（确认）</button>
        </div>

        <!-- 控制操作 -->
        <div class="toolbar-row">
            <h4>⚙️ 控制</h4>
            <button id="undoBtn">撤销</button>
            <button id="clearBtn">清空</button>
            <button id="closeEditor">取消</button>
            <button id="applyEdit">（终极写入）应用修改</button>
        </div>
  `;
    panel.appendChild(toolbar);

    // 把 overlay 插入 body，并锁定 body 滚动
    document.body.appendChild(overlay);
    document.body.classList.add('editor-modal-open');

    // ===== 状态变量 =====
    let tool = null;
    let penColor = "#ff0000", penSize = 5;
    let drawing = false, cropStart = null, cropRect = null;
    let history = [], redoStack = [];
    let roundRadius = 30;
    // 以下两个用于圆角：滑块仅预览 -> 必须点 roundTool 才真正应用
    let roundPreviewActive = false;
    let roundCommitted = false;

    // ===== 历史管理（撤销） =====
    function saveState() {
        // 每次保存都清空 redo 栈
        redoStack = [];
        history.push(canvas.toDataURL());
        if (history.length > 60) history.shift();
    }
    function latestSnapshot() {
        return history.length ? history[history.length - 1] : originalData;
    }
    function undoEdit() {
        if (history.length > 1) {
            redoStack.push(canvas.toDataURL());
            history.pop();
            const im = new Image();
            im.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(im, 0, 0);
            };
            im.src = history[history.length - 1];
        }
    }
    function clearEdit() {
        if (!originalData) return;
        const im = new Image();
        im.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(im, 0, 0);
            history = [canvas.toDataURL()];
            redoStack = [];
        };
        im.src = originalData;
    }

    // ===== 圆角路径与应用函数 =====
    function roundedRectPath(ctx, x, y, w, h, r) {
        r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    // 仅预览（不保存历史），用于滑块移动时即时预览
    function previewRound() {
        const snap = latestSnapshot();
        if (!snap) return;
        const src = new Image();
        src.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const mode = toolbar.querySelector('#roundBgMode').value;
            if (mode === "color") {
                ctx.fillStyle = toolbar.querySelector('#roundBgColor').value;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx.save();


            // ✅ 新增：拉满时强制用最大半径
            let r = roundRadius;
            const maxR = Math.min(canvas.width, canvas.height) / 2;
            if (r >= parseInt(toolbar.querySelector('#roundRadius').max, 10)) {
                r = maxR;
            }


            roundedRectPath(ctx, 0, 0, canvas.width, canvas.height, r);
            ctx.clip();
            ctx.drawImage(src, 0, 0);
            ctx.restore();
            // 此时标记为仅预览
            roundPreviewActive = true;
            roundCommitted = false;
        };
        src.src = snap;
    }
    // 真正应用圆角（保存历史），在用户点「圆角」按钮时调用
    function applyRoundCornerCommit() {
        const snap = latestSnapshot();
        if (!snap) return;
        const src = new Image();
        src.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const mode = toolbar.querySelector('#roundBgMode').value;
            if (mode === "color") {
                ctx.fillStyle = toolbar.querySelector('#roundBgColor').value;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx.save();
            roundedRectPath(ctx, 0, 0, canvas.width, canvas.height, roundRadius);
            ctx.clip();
            ctx.drawImage(src, 0, 0);
            ctx.restore();
            // 保存历史并标记已提交
            saveState();
            roundCommitted = true;
            roundPreviewActive = false;
        };
        src.src = snap;
    }

    // ===== 滤镜（支持预览与应用） =====
    function applyFilter(previewOnly = true) {
        const snap = latestSnapshot();
        if (!snap) return;
        const src = new Image();
        src.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // 构建 filter 字符串
            ctx.filter = `brightness(${toolbar.querySelector('#filterBrightness').value}%) contrast(${toolbar.querySelector('#filterContrast').value}%) blur(${toolbar.querySelector('#filterBlur').value}px)`;
            ctx.drawImage(src, 0, 0);
            ctx.filter = "none";
            if (!previewOnly) saveState();
        };
        src.src = snap;
    }

    // ===== 水印（预览 / 应用） =====
    function drawWatermark(previewOnly = true) {
        const snap = latestSnapshot();
        if (!snap) return;
        const src = new Image();
        src.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(src, 0, 0);
            const size = parseInt(toolbar.querySelector('#wmSize').value, 10) || 30;
            ctx.font = `${size}px sans-serif`;
            ctx.fillStyle = toolbar.querySelector('#wmColor').value;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            const x = (parseFloat(toolbar.querySelector('#wmX').value) / 100) * canvas.width;
            const y = (parseFloat(toolbar.querySelector('#wmY').value) / 100) * canvas.height;
            ctx.fillText(toolbar.querySelector('#wmText').value, x, y);
            if (!previewOnly) saveState();
        };
        src.src = snap;
    }

    // ===== 裁剪（拖拽预览/应用） =====
    function drawCropPreview() {
        const w = canvas.width, h = canvas.height;
        const snap = latestSnapshot();
        if (!snap) return;
        const src = new Image();
        src.onload = () => {
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(src, 0, 0);
            if (!cropRect) return;
            ctx.save();
            ctx.fillStyle = "rgba(0,0,0,0.35)";
            ctx.fillRect(0, 0, w, h);
            ctx.clearRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
            ctx.drawImage(src, cropRect.x, cropRect.y, cropRect.w, cropRect.h, cropRect.x, cropRect.y, cropRect.w, cropRect.h);
            ctx.strokeStyle = "#ff4444";
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(Math.round(cropRect.x) + 0.5, Math.round(cropRect.y) + 0.5, Math.round(cropRect.w) - 1, Math.round(cropRect.h) - 1);
            ctx.restore();
        };
        src.src = snap;
    }

    // ===== 画笔 / 马赛克 事件处理 =====
    function getCanvasPos(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (canvas.width / rect.width),
            y: (e.clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    canvas.onmousedown = (e) => {
        const p = getCanvasPos(e);
        if (tool === "pen") {
            drawing = true;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineWidth = penSize;
            ctx.strokeStyle = penColor;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            saveState(); // 先记录，方便撤销
        } else if (tool === "mosaic") {
            drawing = true;
            saveState();
            ctx.fillStyle = "#999";
            ctx.fillRect(p.x - penSize / 2, p.y - penSize / 2, penSize, penSize);
        } else if (tool === "crop") {
            cropStart = { x: p.x, y: p.y };
            cropRect = null;
        }
    };

    canvas.onmousemove = (e) => {
        const p = getCanvasPos(e);
        if (tool === "pen" && drawing) {
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
        } else if (tool === "mosaic" && drawing) {
            ctx.fillRect(p.x - penSize / 2, p.y - penSize / 2, penSize, penSize);
        } else if (tool === "crop" && cropStart) {
            cropRect = {
                x: Math.min(cropStart.x, p.x),
                y: Math.min(cropStart.y, p.y),
                w: Math.abs(p.x - cropStart.x),
                h: Math.abs(p.y - cropStart.y)
            };
            drawCropPreview();
        }
    };

    const finishFreeDraw = () => {
        if (drawing && (tool === "pen" || tool === "mosaic")) {
            drawing = false;
            saveState(); // 写入历史
        }
    };

    canvas.onmouseup = () => {
        if (tool === "crop" && cropRect) {
            const snap = latestSnapshot();
            const src = new Image();
            src.onload = () => {
                const tmp = document.createElement('canvas');
                tmp.width = Math.max(1, Math.round(cropRect.w));
                tmp.height = Math.max(1, Math.round(cropRect.h));
                tmp.getContext('2d').drawImage(src, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, cropRect.w, cropRect.h);
                canvas.width = tmp.width;
                canvas.height = tmp.height;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(tmp, 0, 0);
                saveState();
                tool = null;
                cropStart = null;
                cropRect = null;
            };
            src.src = snap;
        } else {
            finishFreeDraw();
        }
    };
    canvas.onmouseleave = finishFreeDraw;

    // ===== 事件委托（toolbar 按钮统一处理） =====
    toolbar.addEventListener('click', (e) => {
        const id = e.target.id;
        switch (id) {
            case 'applyEdit': {
                // 如果圆角处于“仅预览未确认”状态 -> 阻止保存（按你要求）
                if (roundPreviewActive && !roundCommitted) {
                    alert('当前处于圆角预览状态，请先点击「圆角（确认）」按钮以应用圆角，或将滑块移回再保存。');
                    return;
                }
                // 把当前画布内容保存回 file 对象
                const src = canvas.toDataURL();
                file.dataURL = src;
                file.convertedData = src;
                file.width = canvas.width;
                file.height = canvas.height;
                if (file.element) {
                    const imgel = file.element.querySelector('img');
                    imgel.src = src;
                    updateMeta(file);
                }
                // 关闭并恢复滚动
                closeAndCleanup();
                break;
            }
            case 'closeEditor': {
                // 取消并关闭 -> 不保存
                closeAndCleanup();
                break;
            }
            case 'penTool': tool = 'pen'; break;
            case 'mosaicTool': tool = 'mosaic'; break;
            case 'cropTool': tool = 'crop'; break;
            case 'roundTool': {
                // 点击「圆角（确认）」按钮 -> 把当前滑块预览真正提交到历史
                applyRoundCornerCommit();
                break;
            }
            case 'applyFilter': {
                // 确认应用滤镜（会保存历史）
                applyFilter(false);
                break;
            }
            case 'applyWatermark': {
                // 确认应用文字水印（会保存历史）
                drawWatermark(false);
                break;
            }
            case 'undoBtn': undoEdit(); break;
            case 'clearBtn': clearEdit(); break;
        }
    });

    // ===== 表单控件联动（滑块 / 颜色 / 文字） =====
    toolbar.querySelector('#penColor').oninput = (e) => penColor = e.target.value;
    toolbar.querySelector('#penSize').oninput = (e) => penSize = parseInt(e.target.value, 10) || 5;

    // 圆角滑块：滑动只实时预览（不保存），必须点击 roundTool 才保存
    toolbar.querySelector('#roundRadius').oninput = (e) => {
        roundRadius = parseInt(e.target.value, 10) || 0;
        // 限制最大为宽高一半
        const maxAllowed = Math.floor(Math.min(canvas.width, canvas.height) / 2);
        if (roundRadius > maxAllowed) roundRadius = maxAllowed;
        previewRound();
    };

    // 背景模式切换（透明或颜色）
    toolbar.querySelector('#roundBgMode').onchange = (e) => {
        toolbar.querySelector('#roundBgColor').disabled = (e.target.value !== 'color');
        // 如果处于圆角预览，刷新预览
        if (roundPreviewActive) previewRound();
    };
    toolbar.querySelector('#roundBgColor').oninput = () => { if (roundPreviewActive) previewRound(); };

    // 滤镜滑块（只预览）
    ['#filterBrightness', '#filterContrast', '#filterBlur'].forEach(id => {
        const el = toolbar.querySelector(id);
        if (el) el.oninput = () => applyFilter(true);
    });

    // 水印滑块/文字（只预览）
    ['#wmText', '#wmSize', '#wmColor', '#wmX', '#wmY'].forEach(id => {
        const el = toolbar.querySelector(id);
        if (el) el.oninput = () => drawWatermark(true);
    });

    // ===== 滑块美化函数：动态设置渐变背景并绑定 input 事件 =====
    function enhanceSliders(root) {
        const sliders = root.querySelectorAll('input[type=range]');
        function updateSliderBg(slider) {
            const min = slider.hasAttribute('min') ? parseFloat(slider.min) : 0;
            const max = slider.hasAttribute('max') ? parseFloat(slider.max) : 100;
            const val = parseFloat(slider.value);
            const pct = (max === min) ? 0 : Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
            // 渐变：蓝色到 pct，灰色到结尾
            slider.style.background = `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${pct}%, #e5e7eb ${pct}%, #e5e7eb 100%)`;
        }
        sliders.forEach(s => {
            updateSliderBg(s);
            s.addEventListener('input', () => updateSliderBg(s), { passive: true });
            s.addEventListener('change', () => updateSliderBg(s));
            window.addEventListener('resize', () => updateSliderBg(s));
        });
    }

    // 立即增强 toolbar 内滑块
    enhanceSliders(toolbar);

    // ===== 关闭并清理（恢复 body 滚动） =====
    function closeAndCleanup() {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        document.body.classList.remove('editor-modal-open');
        // 恢复原来滚动样式（如你项目还有特殊逻辑，这里可以更细）
        // 清理可能的事件监听（若添加了更多全局 listener 可以在这里移除）
    }

    // ===== 打开时做些小优化：限制圆角滑块最大值为画布一半 =====
    // 等 image 加载完成后再设置最大
    img.onloadend = () => {
        const rr = toolbar.querySelector('#roundRadius');
        if (rr) {
            rr.max = Math.floor(Math.min(canvas.width, canvas.height) / 2);
        }
    };
}
















/* ===== 预览图点击进入编辑器 ===== */
document.addEventListener('click', e => {
    if (e.target.tagName === "IMG" && e.target.closest('.preview-item')) {
        const idx = [...previewList.children].indexOf(e.target.closest('.preview-item'));
        if (idx >= 0) openEditor(filesData[idx]);
    }
});

/* ===== 上传 / 拖拽 / 粘贴监听 ===== */
upload.addEventListener('change', e => handleFiles(e.target.files));
dropZone.addEventListener('dragover', e => e.preventDefault());
dropZone.addEventListener('drop', e => { e.preventDefault(); handleFiles(e.dataTransfer.files); });
document.addEventListener('paste', e => {
    const items = e.clipboardData?.items || [];
    for (let it of items) {
        if (it.type.startsWith("image/")) {
            const f = it.getAsFile();
            if (f) handleFiles([f]);
        }
    }
});

/* ===== 清空 ===== */
clearAll.onclick = () => {
    filesData = [];
    previewList.innerHTML = "";
    icoPreview.innerHTML = "";
    compareList.innerHTML = "";
    if (compareSection) compareSection.style.display = "none";
    toggleButtons();
    upload.value = "";
};