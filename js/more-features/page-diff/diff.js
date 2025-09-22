/* ======================================================
 *  工具：转义 HTML —— 防止在结果区域被浏览器当成标签执行
 *  &  -> &amp;   < -> &lt;   > -> &gt;   " -> &quot;   ' -> &#39;
 * ====================================================== */
function escapeHTML(str) {
    if (str == null) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/* ======================================================
 *  智能分词：
 *  - 中文：逐字切分（\u4e00-\u9fa5 + 扩展区）
 *  - 英文：按单词+空格切分
 *  - 数字：作为一个 token
 *  - 标点：单独成为 token（中英文标点都包含）
 *  - 连续空白：作为一个 token（保留排版）
 *  最终返回数组，供 diffArrays 使用
 * ====================================================== */
/* ======================================================
 *  智能分词（JS 正常语法版）：
 *  - 空格
 *  - 英文单词（含 don't 这种）
 *  - 数字（含小数）
 *  - 中文汉字（含扩展 A 区）
 *  - 常见中英文标点
 * ====================================================== */
function tokenizeSmart(text) {
    if (!text) return [];
    return text
        .split(/(\s+|[A-Za-z]+(?:'[A-Za-z]+)?|[0-9]+(?:\.[0-9]+)?|[\u4E00-\u9FFF\u3400-\u4DBF]|[，。！？；：、“”‘’（）《》【】—…·]|[.,!?;:"'(){}\[\]\\/\-])/)
        .filter(Boolean);
}


/* ======================================================
 *  行对比辅助：只汇报“哪些行不同”（更干净）
 *  返回：{ changedLinesOld: [idx...], changedLinesNew: [idx...] }
 * ====================================================== */
function diffLinesShallow(oldText, newText) {
    const oldArr = oldText.split(/\r?\n/);
    const newArr = newText.split(/\r?\n/);
    const max = Math.max(oldArr.length, newArr.length);
    const changedOld = [];
    const changedNew = [];

    for (let i = 0; i < max; i++) {
        if ((oldArr[i] || "") !== (newArr[i] || "")) {
            if (i < oldArr.length) changedOld.push(i + 1); // 1-based
            if (i < newArr.length) changedNew.push(i + 1);
        }
    }
    return { changedLinesOld: changedOld, changedLinesNew: changedNew };
}

/* ======================================================
 *  主对比函数：三种模式
 *  - chars：Diff.diffChars（逐字符，代码友好）
 *  - smart：Diff.diffArrays(tokenizeSmart(...))（中英混排更自然）
 *  - lines：只给出“行有差异”的高阶结果，不展开细节
 * ====================================================== */
function doDiff() {
    const oldText = document.getElementById("diff-old").value;
    const newText = document.getElementById("diff-new").value;
    const mode = document.getElementById("diff-mode").value;
    const showOld = document.getElementById("show-old").checked;
    const showNew = document.getElementById("show-new").checked;

    // 结果容器
    const $inline = document.getElementById("diff-result");
    const $addedBox = document.getElementById("added-content");
    const $rmBox = document.getElementById("removed-content");
    const $addedCnt = document.getElementById("added-count");
    const $rmCnt = document.getElementById("removed-count");
    const $stats = document.getElementById("diff-stats");

    // 行模式：直接给出“哪几行变了”，不走细粒度渲染
    if (mode === "lines") {
        const { changedLinesOld, changedLinesNew } = diffLinesShallow(oldText, newText);
        const same = changedLinesOld.length === 0 && changedLinesNew.length === 0;

        $inline.innerHTML = same
            ? "<em>两份文本在行级别完全一致</em>"
            : `
          <div>原始文本变动行：<b>${changedLinesOld.join(", ") || "无"}</b></div>
          <div>对比文本变动行：<b>${changedLinesNew.join(", ") || "无"}</b></div>
        `;

        // 分栏：直接把变动的整行展示出来（不臃肿）
        const oldArr = oldText.split(/\r?\n/);
        const newArr = newText.split(/\r?\n/);

        const added = changedLinesNew.map(i => newArr[i - 1]).filter(v => v != null && v !== "");
        const removed = changedLinesOld.map(i => oldArr[i - 1]).filter(v => v != null && v !== "");

        window.added = added;
        window.removed = removed;

        $addedBox.innerHTML = added.length
            ? added.map(t => `<div style="color:#16a34a;">${escapeHTML(t)}</div>`).join("")
            : "<em>无</em>";
        $rmBox.innerHTML = removed.length
            ? removed.map(t => `<div style="color:#dc2626;">${escapeHTML(t)}</div>`).join("")
            : "<em>无</em>";

        $addedCnt.innerText = added.length + " 处";
        $rmCnt.innerText = removed.length + " 处";
        $stats.innerHTML = same ? "<em>完全一致</em>" : "<em>存在行差异</em>";
        return;
    }

    // 非“行模式”：计算 diff 片段
    let parts = [];
    if (mode === "chars") {
        parts = Diff.diffChars(oldText, newText); // 逐字符
    } else {
        // 智能：数组 diff（token 更自然）
        parts = Diff.diffArrays(tokenizeSmart(oldText), tokenizeSmart(newText));
    }

    if (!parts.length) {
        $inline.innerHTML = "<em>没有检测到差异</em>";
        $addedBox.innerHTML = "<em>无</em>";
        $rmBox.innerHTML = "<em>无</em>";
        $addedCnt.innerText = "0 处";
        $rmCnt.innerText = "0 处";
        $stats.innerHTML = "<em>完全一致</em>";
        return;
    }

    // 内联渲染 + 统计
    let html = "";
    window.added = [];
    window.removed = [];
    let totalLen = 0, diffLen = 0;

    parts.forEach(part => {
        const raw = Array.isArray(part.value) ? part.value.join("") : part.value; // 数组 -> 字符串
        const safe = escapeHTML(raw); // 防执行
        totalLen += raw.length;

        if (part.added) { diffLen += raw.length; window.added.push(raw); }
        if (part.removed) { diffLen += raw.length; window.removed.push(raw); }

        const color = part.added ? "#16a34a" : part.removed ? "#dc2626" : "#111";
        const bg = part.added ? "rgba(22,163,74,0.15)" : part.removed ? "rgba(220,38,38,0.15)" : "transparent";

        // 根据“显示原始/对比文本”开关决定是否输出
        const shouldShow =
            (part.added && showNew) ||
            (part.removed && showOld) ||
            (!part.added && !part.removed);

        if (shouldShow) {
            html += `<span style="color:${color}; background:${bg}; padding:2px 3px; border-radius:3px; margin:1px;">${safe}</span>`;
        }
    });

    $inline.innerHTML = html;

    // 分栏摘要
    const addedHTML = window.added.length
        ? window.added.map(t => `<div style="color:#16a34a;">${escapeHTML(t)}</div>`).join("")
        : "<em>无</em>";
    const removedHTML = window.removed.length
        ? window.removed.map(t => `<div style="color:#dc2626;">${escapeHTML(t)}</div>`).join("")
        : "<em>无</em>";

    $addedBox.innerHTML = addedHTML;
    $rmBox.innerHTML = removedHTML;

    document.getElementById("added-count").innerText = window.added.length + " 处";
    document.getElementById("removed-count").innerText = window.removed.length + " 处";

    // 相似度（非常粗略，但够展示）
    const similarity = totalLen ? (((totalLen - diffLen) / totalLen) * 100).toFixed(1) : 100;
    $stats.innerHTML = `
      相似度：<b>${similarity}%</b>
      &nbsp;&nbsp; 新增：<span style="color:#16a34a">${window.added.length}</span>
      &nbsp;&nbsp; 删除：<span style="color:#dc2626">${window.removed.length}</span>
    `;
}

/* ======================================================
 *  导出 TXT：把“新增”和“缺少”各自按行导出
 * ====================================================== */
function exportDiff() {
    let content = "【新增的文本】\n" + (window.added && window.added.length ? window.added.join("\n") : "无") + "\n\n";
    content += "【缺少的文本】\n" + (window.removed && window.removed.length ? window.removed.join("\n") : "无");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "diff_result.txt";
    link.click();
}

/* ======================================================
 *  文本框尺寸同步（重点）：
 *  - 两个 textarea 初始高度 350px，支持横竖拖拽（桌面）
 *  - 用 ResizeObserver 监听尺寸变化，双向同步
 *  - 移动端只同步“高度”，并强制只允许竖向 resize
 *  - 做循环保护，避免 A 改触发 B 改再触发 A 改……
 * ====================================================== */
window.addEventListener("DOMContentLoaded", () => {
    const ta1 = document.getElementById("diff-old");
    const ta2 = document.getElementById("diff-new");

    // 默认高度
    ta1.style.height = "350px";
    ta2.style.height = "350px";

    let syncing = false;

    function clampWidth(px, el) {
        const maxW = el.parentElement ? el.parentElement.clientWidth : px;
        return Math.min(px, Math.max(220, maxW)); // 220px 起步，别太窄
    }

    function mirrorSize(source, target) {
        if (syncing) return;
        syncing = true;

        // 同步高度（桌面/移动都同步）
        target.style.height = source.offsetHeight + "px";

        // 桌面端同步宽度；移动端只同步高度并强制全宽
        if (window.matchMedia("(min-width: 769px)").matches) {
            const w = clampWidth(source.offsetWidth, target);
            target.style.width = w + "px";
        } else {
            target.style.width = "100%"; // 移动端全宽，避免横向抖动
        }
        syncing = false;
    }

    const ro1 = new ResizeObserver(() => mirrorSize(ta1, ta2));
    const ro2 = new ResizeObserver(() => mirrorSize(ta2, ta1));
    ro1.observe(ta1);
    ro2.observe(ta2);

    // 兜底：操作结束后再同步一次
    ["mouseup", "keyup"].forEach(evt => {
        ta1.addEventListener(evt, () => mirrorSize(ta1, ta2));
        ta2.addEventListener(evt, () => mirrorSize(ta2, ta1));
    });
});