
// ========== 工具栏按钮触发全屏/分屏时，自动隐藏/恢复导航栏 ==========
const nav = document.querySelector("#navbar") || document.querySelector(".navbar");

// 判断是否需要隐藏导航栏
function shouldHideNav() {
    const cmFS = document.querySelector(".CodeMirror-fullscreen"); // CodeMirror 全屏
    const toolbarFS = document.querySelector(".editor-toolbar.fullscreen"); // 工具栏全屏
    const sideActive = document.querySelector(".editor-preview-side.editor-preview-active"); // 分屏预览
    return !!(cmFS || toolbarFS || sideActive);
}

// 根据状态更新导航栏可见性
function updateNav() {
    if (!nav) return;
    const hide = shouldHideNav();
    nav.style.transform = hide ? "translateY(-100%)" : "";
    nav.style.opacity = hide ? "0" : "";
    nav.style.pointerEvents = hide ? "none" : "";
}

// 监听 DOM 变化（比如点击全屏/分屏按钮）
const mo = new MutationObserver(() => setTimeout(updateNav, 0));
mo.observe(document.documentElement, { attributes: true, childList: true, subtree: true });



// ========== 初始化编辑器 ==========
window.editor = new SimpleMDE({ element: document.getElementById("editor") });

// ========== 下载 Markdown 文件 ==========
window.downloaded = false; // 全局标记

function downloadMarkdown() {
    const text = window.editor.value(); // 获取编辑器内容
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "my-note.md";
    a.click();

    // 点击下载时标记
    window.downloaded = true;
}

// ========== 页面卸载 / 跳转前检测 ==========
window.addEventListener("beforeunload", function (e) {
    if (!window.editor) return;

    const text = window.editor.value().trim();

    // 如果有内容 && 没有下载过
    if (text.length > 0 && !window.downloaded) {
        e.preventDefault();
        e.returnValue = "编辑器中还有内容未下载，确定要离开吗？";
        return "编辑器中还有内容未下载，确定要离开吗？";
    }
});