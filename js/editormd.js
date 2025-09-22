$(function () {
    /* 初始化 Editor.md */
    editormd("editor", { width: "100%", height: "100%", path: "/lib/editor.md/lib/" });

    /* 夜间模式切换 */
    $("#color-toggle, #color-toggle-mobile").on("click", function () {
        const use = $(this).find("use");
        if (use.attr("xlink:href") === "#nav-sun") {
            use.attr("xlink:href", "#nav-dark");
            $(".navbar-wrapper").css("background", "#1f3144");
            $("body").css({ background: "#1e293b", color: "#e2e8f0" });
        } else {
            use.attr("xlink:href", "#nav-sun");
            $(".navbar-wrapper").css("background", "#3D85C6");
            $("body").css({ background: "#fff", color: "#000" });
        }
    });

    /* 工具下拉：延时展开/收起 */
    const dd = $("#tools-dd");
    let openTimer = null, closeTimer = null;

    dd.on("mouseenter", function () {
        clearTimeout(closeTimer);
        openTimer = setTimeout(() => dd.addClass("open"), 120);
    }).on("mouseleave", function () {
        clearTimeout(openTimer);
        closeTimer = setTimeout(() => dd.removeClass("open"), 150);
    });

    dd.find(".nav-dropdown-menu").on("mouseenter", function () {
        clearTimeout(closeTimer);
    }).on("mouseleave", function () {
        closeTimer = setTimeout(() => dd.removeClass("open"), 150);
    });

    /* 移动端汉堡按钮控制 */
    const burger = document.getElementById("burger");
    const mobileMenu = document.getElementById("mobileMenu");

    burger.addEventListener("click", () => {
        burger.classList.toggle("open");
        mobileMenu.classList.toggle("open");
    });


    // 移动端 工具下拉控制
    document.querySelectorAll('.mobile-dropdown-toggle').forEach(toggle => {
        toggle.addEventListener('click', function () {
            const parent = this.parentElement;
            parent.classList.toggle('open');
        });
    });



    // ========== 状态重置函数 ==========
    function resetMobileMenu() {
        document.getElementById("burger").classList.remove("open");
        document.getElementById("mobileMenu").classList.remove("open");
        document.querySelectorAll(".mobile-dropdown").forEach(dd => dd.classList.remove("open"));
    }

    // ========== 监听窗口变化 ==========
    let lastWidth = window.innerWidth;
    window.addEventListener("resize", () => {
        const nowWidth = window.innerWidth;

        // 桌面端 -> 移动端
        if (lastWidth > 768 && nowWidth <= 768) {
            resetMobileMenu(); // 只重置，不刷新
        }

        // 移动端 -> 桌面端
        if (lastWidth <= 768 && nowWidth > 768) {
            resetMobileMenu(); // 同样只重置
        }

        lastWidth = nowWidth;
    });

});