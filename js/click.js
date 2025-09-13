// click-hearts.js  圆润爱心爆裂点击特效（3-4个不同颜色）
// 作者：你最贴心的助手

(function () {
  // --- 1) 注入 CSS：真正的“圆润♥️” --- //
  const style = document.createElement("style");
  style.textContent = `
  .ch-heart {
    position: fixed;
    width: 14px; height: 14px;
    transform: rotate(-45deg);
    transform-origin: center center;
    pointer-events: none;
    z-index: 99999;
  }
  /* 主体是一个旋转-45°的小方块，配合两个圆做心形的上半部 */
  .ch-heart::before,
  .ch-heart::after {
    content: "";
    position: absolute;
    width: 14px; height: 14px;
    border-radius: 50%;
    pointer-events: none;
  }
  .ch-heart::before { top: -7px; left: 0; }
  .ch-heart::after  { top: 0; left: 7px; }

  /* 用 CSS 变量统一颜色，保证三个部分同色且圆润 */
  .ch-heart,
  .ch-heart::before,
  .ch-heart::after { background: var(--ch-color, #ff5a79); }
  `;
  document.head.appendChild(style);

  // --- 2) 参数与状态 --- //
  const COLORS = ["#ff5a79", "#ff9f43", "#5ad8a6", "#4b9bff", "#b37feb", "#ff6f91"];
  const MIN_COUNT = 3, MAX_COUNT = 4;     // 每次点击 3~4 个
  const MIN_SPEED = 1.6, MAX_SPEED = 2.4; // 初速度
  const GRAVITY   = 0.04;                 // 类似重力，向上爆再缓落，想一直上升改为负值
  const LIFE_MS   = 900;                  // 每个心的寿命（毫秒）
  const SCALE_FROM = 0.9, SCALE_TO = 1.6; // 放大
  const ALPHA_FROM = 1.0, ALPHA_TO = 0.0; // 淡出

  /** 粒子容器 */
  const hearts = [];

  // --- 3) 工具函数 --- //
  function rand(min, max) { return min + Math.random() * (max - min); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  function createHeart(x, y, vx, vy, color) {
    const el = document.createElement("div");
    el.className = "ch-heart";
    el.style.setProperty("--ch-color", color);
    el.style.left = `${x}px`;
    el.style.top  = `${y}px`;
    document.body.appendChild(el);
    const birth = performance.now();

    hearts.push({
      el,
      x, y, vx, vy,
      birth
    });
  }

  // --- 4) 点击产生 3-4 个彩色爱心，方向有散射 --- //
  function burstHearts(ev) {
    const x = ev.clientX;
    const y = ev.clientY;
    const count = (Math.random() * (MAX_COUNT - MIN_COUNT + 1) | 0) + MIN_COUNT;

    // 以上方为中心扇面，±35°散射
    for (let i = 0; i < count; i++) {
      const angle = (-90 + rand(-35, 35)) * Math.PI / 180; // -90°附近（正上方）
      const speed = rand(MIN_SPEED, MAX_SPEED);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      createHeart(x, y, vx, vy, pick(COLORS));
    }
  }

  // --- 5) 动画循环：位移、缩放、透明度 --- //
  function animate(now) {
    for (let i = hearts.length - 1; i >= 0; i--) {
      const h = hearts[i];
      const age = now - h.birth;
      const t = Math.min(1, age / LIFE_MS); // 0->1

      // 运动：简单物理（vx 恒定，vy 受重力）
      h.vy += GRAVITY;
      h.x += h.vx;
      h.y += h.vy;

      // 插值缩放 & 透明度
      const scale = SCALE_FROM + (SCALE_TO - SCALE_FROM) * t;
      const alpha = ALPHA_FROM + (ALPHA_TO - ALPHA_FROM) * t;

      h.el.style.transform = `translate3d(-50%,-50%,0) rotate(-45deg) scale(${scale})`;
      h.el.style.opacity = alpha.toFixed(3);
      h.el.style.left = `${h.x}px`;
      h.el.style.top  = `${h.y}px`;

      if (t >= 1) {
        h.el.remove();
        hearts.splice(i, 1);
      }
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  // --- 6) 事件绑定（只在主文档点击时触发） --- //
  document.addEventListener("click", function (e) {
    // 避免在选择文字或拖拽时误触
    if (window.getSelection && String(window.getSelection())) return;
    burstHearts(e);
  }, { passive: true });

})();
