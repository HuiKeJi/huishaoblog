document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.getElementById('wallpaperGrid')
  const res = await fetch('/img-wallpaper/wallpaper/wallpapers.json', {
    cache: 'no-store',
  })
  const wallpapers = await res.json()
  let filtered = [...wallpapers]

  // 新更新
  function adjustPadding() {
    const navbar = document.querySelector('.wallpaper-navbar')
    const page = document.querySelector('.wallpaper-page')
    if (navbar && page) {
      page.style.paddingTop = navbar.offsetHeight + 10 + 'px' // 顶栏高度 + 一点间距
    }
  }

  // window.addEventListener("load", adjustPadding);
  adjustPadding() // 页面加载完立即执行一次
  window.addEventListener('resize', adjustPadding)

  // 手动分类映射
  const categoryMap = {
    动漫: ['动漫', '动画'],
    风景: ['风景'],
    原神: ['原神'],
    真人: ['真人'],
  }

  const categorySelect = document.getElementById('categorySelect')
  Object.keys(categoryMap).forEach((c) => {
    const opt = document.createElement('option')
    opt.value = c
    opt.textContent = c
    categorySelect.appendChild(opt)
  })

  // 分辨率
  // const resSelect = document.getElementById("resolutionSelect");
  // [...new Set(wallpapers.map(it => `${it.w}x${it.h}`))].forEach(r => {
  //     const opt = document.createElement("option");
  //     opt.value = r;
  //     opt.textContent = r;
  //     resSelect.appendChild(opt);
  // });
  // ===== 分辨率分组 =====
  const resSelect = document.getElementById('resolutionSelect')
  const groups = {
    '1080P 级别 (≤1920宽)': (w) => w <= 1920,
    '2K / 4K 级别 (1921–3840宽)': (w) => w > 1920 && w <= 3840,
    '8K 级别 (3841–7680宽)': (w) => w > 3840 && w <= 7680,
    '超高分辨率 (>7680宽)': (w) => w > 7680,
  }

  // 取出所有分辨率数据
  const allRes = wallpapers.map((it) => ({
    w: it.w,
    h: it.h,
  }))

  // 检查哪些组有数据
  Object.entries(groups).forEach(([label, check]) => {
    if (allRes.some((r) => check(r.w))) {
      const opt = document.createElement('option')
      opt.value = label // 用 label 作为筛选值
      opt.textContent = label
      resSelect.appendChild(opt)
    }
  })

  const formatSize = (bytes) => (bytes / 1024 / 1024).toFixed(2) + ' MB'

  // 渲染
  // function render(list) {
  //     grid.innerHTML = list.map(it => {
  //         const label = it.file.replace(/\.\w+$/, "");
  //         const thumb = `/img-wallpaper/wallpaper/thumb/${it.file}`;
  //         return `
  // <div class="wallpaper-card" data-file="${it.file}">
  //   <img src="${thumb}" alt="${label}" loading="eager" decoding="sync">
  //   <div class="wallpaper-info">
  //     <div>${label.replace(/-/g,"、")}</div>
  //     <div>${it.w}×${it.h}</div>
  //     <div>${formatSize(it.size)}</div>
  //   </div>
  // </div>`;
  //     }).join("");
  // }
  function render(list) {
    grid.innerHTML = list
      .map((it) => {
        const label = it.file.replace(/\.\w+$/, '')
        // 去掉数字，再按 - 切分
        const parts = label
          .replace(/\d+/g, '') // 🔴 删除所有数字
          .split('-') // 按 - 切分
          .map((p) => p.trim()) // 去掉前后空格
          .filter((p) => p.length > 0) // 过滤空项

        const display = parts.join('、')
        const thumb = `/img-wallpaper/wallpaper/thumb/${it.file}`
        return `
                <div class="wallpaper-card" data-file="${it.file}">
                <img src="${thumb}" alt="${display}" loading="eager" decoding="sync">
                <div class="wallpaper-info">
                    <div>${display}</div>
                    <div>${it.w}×${it.h}</div>
                    <div>${formatSize(it.size)}</div>
                </div>
                </div>`
      })
      .join('')
  }

  // 过滤 + 排序
  // function applyFilters() {
  //     const cat = categorySelect.value;
  //     const reso = resSelect.value;
  //     const keyword = document.getElementById("searchInput").value.trim();
  //     const sort = document.getElementById("sortSelect").value;

  //     filtered = wallpapers.filter(it => {
  //         if (cat !== "all") {
  //             const prefixes = categoryMap[cat];
  //             if (!prefixes.some(p => it.file.startsWith(p))) return false;
  //         }
  //         if (reso !== "all" && `${it.w}x${it.h}` !== reso) return false;
  //         if (keyword && !it.file.includes(keyword)) return false;
  //         return true;
  //     });

  //     if (sort === "newest") filtered.sort((a, b) => b.mtime - a.mtime);
  //     if (sort === "oldest") filtered.sort((a, b) => a.mtime - b.mtime);

  //     render(filtered);
  // }
  function applyFilters() {
    const cat = categorySelect.value
    const reso = resSelect.value
    const resoInput = document.getElementById('resolutionInput').value.trim()
    const keyword = document.getElementById('searchInput').value.trim()
    const sort = document.getElementById('sortSelect').value

    filtered = wallpapers.filter((it) => {
      if (cat !== 'all') {
        const prefixes = categoryMap[cat]
        if (!prefixes.some((p) => it.file.startsWith(p))) return false
      }

      // if (reso !== "all" && `${it.w}x${it.h}` !== reso) return false;
      if (reso !== 'all') {
        if (reso.includes('1080P') && !(it.w <= 1920)) return false
        if (reso.includes('2K / 4K') && !(it.w > 1920 && it.w <= 3840)) return false
        if (reso.includes('8K') && !(it.w > 3840 && it.w <= 7680)) return false
        if (reso.includes('超高') && !(it.w > 7680)) return false
      }

      if (resoInput && `${it.w}x${it.h}` !== resoInput) return false
      if (keyword && !it.file.includes(keyword)) return false
      return true
    })

    if (sort === 'newest') filtered.sort((a, b) => b.mtime - a.mtime)
    if (sort === 'oldest') filtered.sort((a, b) => a.mtime - b.mtime)

    render(filtered)
  }

  //
  categorySelect.addEventListener('change', applyFilters)
  resSelect.addEventListener('change', applyFilters)
  document.getElementById('searchBtn').addEventListener('click', applyFilters)
  document.getElementById('sortSelect').addEventListener('change', applyFilters)

  document.getElementById('resolutionInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') applyFilters()
  })
  document.getElementById('resolutionInput').addEventListener('change', applyFilters)

  // 预览
  const lightbox = document.getElementById('lightbox')
  const lightboxImg = lightbox.querySelector('img')
  const downloadBtn = document.getElementById('downloadBtn')
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.wallpaper-card')
    if (!card) return
    const file = card.dataset.file
    const url = `/img-wallpaper/wallpaper/full/${file}`
    lightboxImg.src = url
    downloadBtn.href = url
    lightbox.classList.remove('hidden')
  })
  lightbox.querySelector('.close').addEventListener('click', () => {
    lightbox.classList.add('hidden')
  })

  applyFilters()
})
