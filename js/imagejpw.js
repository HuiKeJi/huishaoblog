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


/* ========= 图片编辑器 ========= */
function openEditor(file) {
    const overlay = document.createElement('div');
    overlay.id = "editorOverlay";

    const panel = document.createElement('div');
    panel.id = "editorPanel";
    overlay.appendChild(panel);



    // 画布
    const canvas = document.createElement('canvas');
    canvas.id = "editorCanvas";
    canvas.style.visibility = "hidden";   // ✅ 初始隐藏
    const ctx = canvas.getContext('2d');
    panel.appendChild(canvas);

    // 载图
    const img = new Image();
    img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        canvas.style.visibility = "visible";  // ✅ 绘制完成后显示

        originalData = canvas.toDataURL();
        saveState();
    };
    img.src = file.dataURL;





    const toolbar = document.createElement('div');
    toolbar.id = "editorToolbar";
    toolbar.innerHTML = `
    <button id="closeEditor">取消</button>
    <button id="applyEdit">应用修改</button>
    <button id="penTool" class="tool-btn">画笔</button>
    <button id="mosaicTool" class="tool-btn">马赛克</button>
    <button id="cropTool" class="tool-btn">裁剪</button>
    <button id="roundTool" class="tool-btn">圆角</button>
    <input type="range" id="roundRadius" min="0" max="200" value="30" title="圆角半径">
    <button id="undoBtn">撤销</button>
    <button id="clearBtn">清空编辑</button>
    <input type="color" id="penColor" value="#ff0000" title="画笔颜色">
    <input type="range" id="penSize" min="2" max="40" value="5" title="粗细">
  `;
    panel.appendChild(toolbar);
    document.body.appendChild(overlay);

    /* ===== 状态 ===== */
    let tool = null, penColor = "#ff0000", penSize = 5, roundRadius = 30;
    let drawing = false, cropStart = null, cropRect = null;
    let history = [], redoStack = [], originalData = null;

    function saveState() {
        redoStack = [];
        history.push(canvas.toDataURL());
        if (history.length > 50) history.shift();
    }

    function undoEdit() {
        if (history.length > 1) {
            redoStack.push(canvas.toDataURL());
            history.pop();
            const img = new Image();
            img.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
            };
            img.src = history[history.length - 1];
        }
    }

    function clearEdit() {
        const img = new Image();
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            history = [canvas.toDataURL()];
            redoStack = [];
        };
        img.src = originalData;
    }

    /* ===== 圆角处理 ===== */
    function applyRoundCorners(radius) {
        const img = new Image();
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.beginPath();
            const r = Math.min(radius, canvas.width / 2, canvas.height / 2);
            ctx.moveTo(r, 0);
            ctx.arcTo(canvas.width, 0, canvas.width, canvas.height, r);
            ctx.arcTo(canvas.width, canvas.height, 0, canvas.height, r);
            ctx.arcTo(0, canvas.height, 0, 0, r);
            ctx.arcTo(0, 0, canvas.width, 0, r);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(img, 0, 0);
            ctx.restore();
            saveState();
        };
        img.src = history[history.length - 1];
    }

    /* ===== 坐标换算 ===== */
    function getCanvasPos(canvas, e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (canvas.width / rect.width),
            y: (e.clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    /* ===== 鼠标事件 ===== */
    canvas.onmousedown = (e) => {
        const pos = getCanvasPos(canvas, e);
        if (tool === "crop") {
            cropStart = pos;
        } else if (tool === "pen" || tool === "mosaic") {
            drawing = true;
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
            saveState();
        }
    };

    canvas.onmousemove = (e) => {
        const pos = getCanvasPos(canvas, e);
        if (tool === "pen" && drawing) {
            ctx.lineWidth = penSize;
            ctx.strokeStyle = penColor;
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
        } else if (tool === "mosaic" && drawing) {
            ctx.fillStyle = "#999";
            ctx.fillRect(pos.x - penSize / 2, pos.y - penSize / 2, penSize, penSize);
        } else if (tool === "crop" && cropStart) {
            const snap = new Image();
            snap.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(snap, 0, 0);
                ctx.strokeStyle = "#ff4d4f";
                ctx.lineWidth = 2;
                ctx.strokeRect(cropStart.x, cropStart.y, pos.x - cropStart.x, pos.y - cropStart.y);
            };
            snap.src = history[history.length - 1];
            cropRect = { x: cropStart.x, y: cropStart.y, w: pos.x - cropStart.x, h: pos.y - cropStart.y };
        }
    };

    canvas.onmouseup = () => {
        if (tool === "crop" && cropRect) {
            const temp = document.createElement("canvas");
            temp.width = Math.abs(cropRect.w);
            temp.height = Math.abs(cropRect.h);
            const tctx = temp.getContext("2d");
            tctx.drawImage(
                canvas,
                cropRect.w < 0 ? cropRect.x + cropRect.w : cropRect.x,
                cropRect.h < 0 ? cropRect.y + cropRect.h : cropRect.y,
                Math.abs(cropRect.w), Math.abs(cropRect.h),
                0, 0, Math.abs(cropRect.w), Math.abs(cropRect.h)
            );
            canvas.width = temp.width;
            canvas.height = temp.height;
            ctx.drawImage(temp, 0, 0);
            saveState();
        }
        drawing = false;
        cropStart = null;
    };

    /* ===== 工具栏事件 ===== */
    function selectTool(name) {
        tool = name;
        ["penTool", "mosaicTool", "cropTool", "roundTool"].forEach(id => {
            const btn = toolbar.querySelector("#" + id);
            if (btn) btn.classList.toggle("activeTool", id === name + "Tool");
        });
    }

    toolbar.querySelector('#closeEditor').onclick = () => document.body.removeChild(overlay);

    toolbar.querySelector('#applyEdit').onclick = () => {
        // 内部仍用 PNG 保存，确保圆角透明不丢失
        file.dataURL = canvas.toDataURL("image/png");
        file.convertedData = file.dataURL;

        // 同步尺寸（裁剪后会变化）
        file.width = canvas.width;
        file.height = canvas.height;

        // 更新卡片图与信息
        if (file.element) {
            const img = file.element.querySelector('img');
            img.src = file.dataURL;
            updateMeta(file);
        }

        document.body.removeChild(overlay);
    };

    toolbar.querySelector('#penTool').onclick = () => selectTool("pen");
    toolbar.querySelector('#mosaicTool').onclick = () => selectTool("mosaic");
    toolbar.querySelector('#cropTool').onclick = () => selectTool("crop");
    toolbar.querySelector('#roundTool').onclick = () => { selectTool("round"); applyRoundCorners(roundRadius); };
    toolbar.querySelector('#undoBtn').onclick = () => undoEdit();
    toolbar.querySelector('#clearBtn').onclick = () => clearEdit();

    toolbar.querySelector('#penColor').oninput = (e) => penColor = e.target.value;
    toolbar.querySelector('#penSize').oninput = (e) => penSize = parseInt(e.target.value, 10);
    toolbar.querySelector('#roundRadius').oninput = (e) => {
        roundRadius = parseInt(e.target.value, 10);
        if (tool === "round") applyRoundCorners(roundRadius);
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