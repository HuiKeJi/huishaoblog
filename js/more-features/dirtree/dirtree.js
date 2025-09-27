
/* ========== 树节点类 ========== */
class DTNode {
    constructor(name, isFile = false) {
        this.name = name;
        this.isFile = isFile;
        this.children = new Map();
    }
}

/* ========== 工具函数 ========== */
// 中文/数字友好排序
function dtSort(a, b) {
    return a.localeCompare(b, "zh-Hans-CN", { numeric: true, sensitivity: "base" });
}
// 获取或新增子节点
function dtGetOrAdd(parent, name, isFile = false) {
    if (!name) return parent;
    if (!parent.children.has(name)) {
        parent.children.set(name, new DTNode(name, isFile));
    } else if (isFile) {
        parent.children.get(name).isFile = true;
    }
    return parent.children.get(name);
}
// 拼接路径，避免重复斜杠
function dtJoinPath(segs, isDir) {
    const clean = segs.filter(Boolean).map(s => s.replace(/^\/+|\/+$/g, ""));
    return clean.join("/") + (isDir ? "/" : "");
}
// 判断是否文件
function dtLooksFile(seg) {
    if (!seg) return false;
    if (seg.endsWith("/")) return false;
    return seg.includes(".") && !seg.endsWith(".");
}

/* ========== 列表 → 树 ========== */
function buildTreeFromPathList(text, includeFiles, sortItems) {
    const root = new DTNode("");
    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    for (let raw of lines) {
        raw = raw.replace(/^[-*+]\s+/, "");
        const tmp = raw.replace(/\\/g, "/");
        const segs = tmp.split("/").map(s => s.trim()).filter(Boolean);
        if (!segs.length) continue;
        let cur = root;
        for (let i = 0; i < segs.length; i++) {
            const last = i === segs.length - 1;
            const seg = segs[i];
            const isFile = last && dtLooksFile(seg);
            if (isFile && !includeFiles) break;
            cur = dtGetOrAdd(cur, seg, isFile);
        }
    }
    if (sortItems) sortTreeInPlace(root);
    return root;
}

/* ========== 树文本 → 树 ========== */
function buildTreeFromPrettyText(text, includeFiles, sortItems) {
    const root = new DTNode("");
    const stack = [{ indent: -1, node: root }];
    const lines = text.split(/\r?\n/).map(s => s.replace(/\t/g, "  "));
    for (let raw of lines) {
        let line = raw;
        if (!line.trim()) continue;
        line = line.replace(/^[\s│├└╰─—┃╎╏┆┇┊┋]+/, m => m.replace(/[^\s]/g, " "));
        const md = line.match(/^(\s*)([-*+])\s+(.*)$/);
        let indent, name;
        if (md) {
            indent = md[1].length;
            name = md[3].trim();
        } else {
            const m = line.match(/^(\s*)(.+)$/);
            indent = m ? m[1].length : 0;
            name = m ? m[2].trim() : "";
        }
        if (!name) continue;
        const isDirHint = /\/$/.test(name);
        name = name.replace(/\/+$/, "");
        while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop();
        const parent = stack[stack.length - 1].node;
        const isFile = !isDirHint && dtLooksFile(name);
        if (isFile && !includeFiles) {
            stack.push({ indent, node: parent });
            continue;
        }
        const node = dtGetOrAdd(parent, name, isFile);
        stack.push({ indent, node });
    }
    if (sortItems) sortTreeInPlace(root);
    return root;
}

/* ========== 树 → 列表/JSON/Array ========== */
function treeToPathList(root) {
    const lines = [];
    function dfs(node, segs) {
        for (const [name, child] of node.children) {
            const nextSegs = [...segs, name];
            const line = dtJoinPath(nextSegs, !child.isFile);
            lines.push(line);
            if (!child.isFile) dfs(child, nextSegs);
        }
    }
    dfs(root, []);
    return lines;
}
function treeToJSON(root) {
    function toObj(node) {
        if (node.isFile) return "file";
        const o = {};
        for (const [name, child] of node.children) {
            o[name] = toObj(child);
        }
        return o;
    }
    return JSON.stringify(toObj(root), null, 2);
}

/* ========== 树 → ASCII/Unicode/Markdown ========== */
function printAsciiTree(node, prefix = "") {
    let out = "";
    const entries = Array.from(node.children.entries());
    entries.forEach(([name, child], idx) => {
        const last = idx === entries.length - 1;
        out += `${prefix}${last ? "└── " : "├── "}${name}\n`;
        if (!child.isFile) {
            out += printAsciiTree(child, prefix + (last ? "    " : "│   "));
        }
    });
    return out;
}
function printUnicodeTree(node, prefix = "") {
    let out = "";
    const entries = Array.from(node.children.entries());
    entries.forEach(([name, child], idx) => {
        const last = idx === entries.length - 1;
        out += `${prefix}${last ? "╰─ " : "├─ "}${name}\n`;
        if (!child.isFile) {
            out += printUnicodeTree(child, prefix + (last ? "   " : "│  "));
        }
    });
    return out;
}
function printMarkdownTree(node, prefix = "") {
    let out = "";
    const entries = Array.from(node.children.entries());
    entries.forEach(([name, child]) => {
        out += `${prefix}- ${name}\n`;
        if (!child.isFile) out += printMarkdownTree(child, prefix + "  ");
    });
    return out;
}

/* ========== 树排序 ========== */
function sortTreeInPlace(node) {
    const entries = Array.from(node.children.entries()).sort((a, b) => dtSort(a[0], b[0]));
    node.children = new Map(entries);
    for (const [, child] of node.children) {
        if (!child.isFile) sortTreeInPlace(child);
    }
}

/* ========== UI逻辑 ========== */
const $input = document.getElementById("dt-input");
const $output = document.getElementById("dt-output");
const $copy = document.getElementById("dt-copy");
const $toast = document.getElementById("dt-toast");
const $modeRadios = Array.from(document.querySelectorAll("input[name=mode]"));
const $format = document.getElementById("dt-format");
const $includeFiles = document.getElementById("dt-include-files");
const $sort = document.getElementById("dt-sort");

function fillFormatOptions(mode) {
    $format.innerHTML = "";
    if (mode === "tree2list") {
        // ✅ 增加一个 array 格式
        [["path", "路径列表"], ["json", "JSON 格式"], ["array", "JavaScript 数组"]].forEach(([v, t]) => {
            const o = document.createElement("option");
            o.value = v; o.textContent = t;
            $format.appendChild(o);
        });
    } else {
        [["ascii", "ASCII 树形字符"], ["unicode", "Unicode 树形字符"], ["markdown", "Markdown 树格式"]].forEach(([v, t]) => {
            const o = document.createElement("option");
            o.value = v; o.textContent = t;
            $format.appendChild(o);
        });
    }
}

function autosize(el, maxH) {
    el.style.height = "auto";
    const h = Math.min(maxH, Math.max(120, el.scrollHeight));
    el.style.height = h + "px";
}

function convert() {
    const mode = $modeRadios.find(r => r.checked).value;
    const includeFiles = $includeFiles.checked;
    const sortItems = $sort.checked;
    const fmt = $format.value;
    const txt = $input.value;
    try {
        let root, out = "";
        if (mode === "tree2list") {
            root = buildTreeFromPrettyText(txt, includeFiles, sortItems);
            const lines = treeToPathList(root);
            if (fmt === "path") {
                out = lines.join("\n");
            } else if (fmt === "json") {
                out = JSON.stringify(lines, null, 2);
            } else if (fmt === "array") {
                // ✅ 新增：JavaScript 数组格式，带引号 + 逗号
                out = "[\n" + lines.map(l => `  '${l}'`).join(",\n") + "\n]";
            }
        } else {
            root = buildTreeFromPathList(txt, includeFiles, sortItems);
            if (fmt === "ascii") out = printAsciiTree(root);
            else if (fmt === "unicode") out = printUnicodeTree(root);
            else out = printMarkdownTree(root);
        }
        $output.value = out;
    } catch (e) {
        $output.value = "解析失败：" + (e.message || e);
    } finally {
        autosize($input, 600);
        autosize($output, 400);
    }
}

/* 事件绑定 */
$input.addEventListener("input", convert);
$format.addEventListener("change", convert);
$includeFiles.addEventListener("change", convert);
$sort.addEventListener("change", convert);
$modeRadios.forEach(r => r.addEventListener("change", () => { fillFormatOptions(r.value); convert(); }));

/* ========== 切换模式时重置 ========== */
$modeRadios.forEach(r => {
    r.addEventListener("change", () => {
        fillFormatOptions(r.value);  // 更新下拉选项
        $input.value = "";           // 清空输入框
        $output.value = "";          // 清空输出框
        autosize($input, 600);       // 重置高度
        autosize($output, 400);      // 重置高度
    });
});

// 复制按钮：复制结果 + 显示提示
$copy.addEventListener("click", () => {
    $output.select();
    document.execCommand("copy");
    $toast.classList.add("on");
    setTimeout(() => $toast.classList.remove("on"), 1200);
});

/* 初始化 */
fillFormatOptions("tree2list");
convert();