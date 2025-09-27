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
    动漫: ['动漫', '动画', '少女'],
    风景: ['风景'],
    游戏: ['游戏', '原神', '鸣潮', 'CF'],
    真人: ['真人'],
  }

  const categorySelect = document.getElementById('categorySelect')
  // 👉 初始先塞一条“全部分类”，其余交由 refreshCategoryOptions 动态生成
  categorySelect.innerHTML = '<option value="all">全部分类</option>'

  // ===== 类型选择 =====
  const typeSelect = document.getElementById('typeSelect')
  const resSelect = document.getElementById('resolutionSelect')

  // 电脑分辨率分组
  const pcGroups = {
    '1080P 级别 (≤1920宽)': (w, h) => w <= 1920,
    '2K / 4K 级别 (1921–3840宽)': (w, h) => w > 1920 && w <= 3840,
    '8K 级别 (3841–7680宽)': (w, h) => w > 3840 && w <= 7680,
    '超高分辨率 (>7680宽)': (w, h) => w > 7680,
  }

  // 手机分辨率分组（建议按“高”来分）
  const mobileGroups = {
    '720P 级别 (≤1280高)': (w, h) => h <= 1280,
    '1080P 级别 (1281–1920高)': (w, h) => h > 1280 && h <= 1920,
    '2K 级别 (1921–2560高)': (w, h) => h > 1920 && h <= 2560,
    '4K 级别 (>2560高)': (w, h) => h > 2560,
  }

  // 动态壁纸分组（视频）
  const liveGroups = {
    '动态壁纸-电脑横屏': (w, h) => w >= h,
    '动态壁纸-手机竖屏': (w, h) => h > w,
  }

  // ==== 新增：统一的组合分组映射（方便 type=all 时用标签直接匹配） ====
  const allGroupFuncs = {
    ...pcGroups,
    ...mobileGroups,
    ...liveGroups,
  }

  // ==== 新增：类型过滤器 ====
  function filterByType(list, type) {
    if (type === 'pc') return list.filter((it) => it.w >= it.h) // 横屏
    if (type === 'mobile') return list.filter((it) => it.h > it.w) // 竖屏

    if (type === 'live') {
      // ==== 修改点：加入 .com 后缀 ====
      return list.filter(
        (it) => it.file.endsWith('.mp4') || it.file.endsWith('.webm') || it.file.endsWith('.com')
      )
    }

    return list // all
  }

  // ==== 新增：分类过滤器（基于文件名关键词）====
  function filterByCategory(list, category) {
    if (!category || category === 'all') return list
    const prefixes = categoryMap[category] || []
    return list.filter((it) => prefixes.some((p) => it.file.includes(p)))
  }

  // ================== 刷新分类下拉框 ==================
  // 规则：跟随“类型”变化；只显示当前类型下“确实存在数据”的分类
  function refreshCategoryOptions(type) {
    categorySelect.innerHTML = '<option value="all">全部分类</option>'
    const base = filterByType(wallpapers, type) // 先按类型筛一遍

    Object.entries(categoryMap).forEach(([cat, prefixes]) => {
      const hasData = base.some((it) => prefixes.some((p) => it.file.includes(p)))
      if (hasData) {
        const opt = document.createElement('option')
        opt.value = cat
        opt.textContent = cat
        categorySelect.appendChild(opt)
      }
    })
  }

  // ================== 刷新分辨率下拉框 ==================
  function refreshResolutionOptions(type, category) {
    resSelect.innerHTML = '<option value="all">全部分辨率</option>'

    // 先做类型 + 分类的基线过滤
    let base = filterByType(wallpapers, type)
    base = filterByCategory(base, category)

    // 内部工具：给下拉塞入该组中“确有数据”的标签
    const appendGroupsIfAny = (groups) => {
      Object.entries(groups).forEach(([label, check]) => {
        if (base.some((it) => check(it.w, it.h))) {
          const opt = document.createElement('option')
          opt.value = label
          opt.textContent = label
          resSelect.appendChild(opt)
        }
      })
    }

    if (type === 'pc') {
      appendGroupsIfAny(pcGroups)
    } else if (type === 'mobile') {
      appendGroupsIfAny(mobileGroups)
    } else if (type === 'live') {
      appendGroupsIfAny(liveGroups)
    } else {
      // ==== 新增逻辑：type=all 时，按实际数据“并集显示”三套分组 ====
      const hasPC = base.some(
        (it) =>
          it.w >= it.h &&
          !(it.file.endsWith('.mp4') || it.file.endsWith('.webm') || it.file.endsWith('.com'))
      )
      const hasMobile = base.some(
        (it) =>
          it.h > it.w &&
          !(it.file.endsWith('.mp4') || it.file.endsWith('.webm') || it.file.endsWith('.com'))
      )
      const hasLive = base.some(
        (it) => it.file.endsWith('.mp4') || it.file.endsWith('.webm') || it.file.endsWith('.com')
      )

      if (hasPC) appendGroupsIfAny(pcGroups)
      if (hasMobile) appendGroupsIfAny(mobileGroups)
      if (hasLive) appendGroupsIfAny(liveGroups)
    }
  }

  // 初始化：默认“全部类型 + 全部分类”
  refreshCategoryOptions('all')
  refreshResolutionOptions('all', 'all')

  const formatSize = (bytes) => (bytes / 1024 / 1024).toFixed(2) + ' MB'

  // 渲染
  // function render(list) {
  //   grid.innerHTML = list
  //     .map((it) => {
  //       const label = it.file.replace(/\.\w+$/, '')
  //       const parts = label
  //         .replace(/\d+/g, '') // 🔴 删除所有数字
  //         .split('-') // 按 - 切分
  //         .map((p) => p.trim())
  //         .filter((p) => p.length > 0)

  //       const display = parts.join('、')
  //       // const thumb = `/img-wallpaper/wallpaper/thumb/${it.file}`
  //       const thumb = `/img-wallpaper/wallpaper/thumb/${it.thumbFile || it.file}`

  //       return `
  //               <div class="wallpaper-card" data-file="${it.file}">
  //               <img src="${thumb}" alt="${display}" loading="eager" decoding="sync">
  //               <div class="wallpaper-info">
  //                   <div>${display}</div>
  //                   <div>${it.w}×${it.h}</div>
  //                   <div>${formatSize(it.size)}</div>
  //               </div>
  //               </div>`
  //     })
  //     .join('')
  // }
  // 渲染
  function render(list) {
    grid.innerHTML = list
      .map((it) => {
        const label = it.file.replace(/\.\w+$/, '')
        const parts = label
          .replace(/\d+/g, '') // 🔴 删除所有数字
          .split('-') // 按 - 切分
          .map((p) => p.trim())
          .filter((p) => p.length > 0)

        const display = parts.join('、')

        // ==== 判断缩略图是图片还是视频 ====
        const thumb = `/img-wallpaper/wallpaper/thumb/${it.thumbFile || it.file}`
        const isVideoThumb =
          thumb.endsWith('.mp4') || thumb.endsWith('.webm') || thumb.endsWith('.com')

        // 如果是视频 → 用 <video> 做缩略图，自动播放+静音+循环
        const thumbTag = isVideoThumb
          ? `<video src="${thumb}" autoplay muted loop playsinline></video>`
          : `<img src="${thumb}" alt="${display}" loading="eager" decoding="sync">`

        return `
        <div class="wallpaper-card" data-file="${it.file}">
          ${thumbTag}
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
  function applyFilters() {
    const type = typeSelect.value
    const cat = categorySelect.value
    const reso = resSelect.value
    const resoInput = document.getElementById('resolutionInput').value.trim()
    const keyword = document.getElementById('searchInput').value.trim()
    const sort = document.getElementById('sortSelect').value

    filtered = wallpapers.filter((it) => {
      // 类型过滤
      if (type === 'pc' && !(it.w >= it.h)) return false
      if (type === 'mobile' && !(it.h > it.w)) return false
      if (
        type === 'live' &&
        !(it.file.endsWith('.mp4') || it.file.endsWith('.webm') || it.file.endsWith('.com'))
      )
        return false

      // 分辨率分组过滤
      if (reso !== 'all') {
        const groupFunc =
          (type === 'pc' && pcGroups[reso]) ||
          (type === 'mobile' && mobileGroups[reso]) ||
          (type === 'live' && liveGroups[reso]) ||
          allGroupFuncs[reso]
        if (groupFunc && !groupFunc(it.w, it.h)) return false
      }

      if (resoInput && `${it.w}x${it.h}` !== resoInput) return false

      if (cat !== 'all') {
        const prefixes = categoryMap[cat] || []
        if (!prefixes.some((p) => it.file.includes(p))) return false
      }

      if (keyword && !it.file.includes(keyword)) return false

      return true
    })

    if (sort === 'newest') filtered.sort((a, b) => b.mtime - a.mtime)
    if (sort === 'oldest') filtered.sort((a, b) => a.mtime - b.mtime)

    render(filtered)
  }

  //
  typeSelect.addEventListener('change', () => {
    refreshCategoryOptions(typeSelect.value)
    refreshResolutionOptions(typeSelect.value, categorySelect.value)
    applyFilters()
  })
  categorySelect.addEventListener('change', () => {
    refreshResolutionOptions(typeSelect.value, categorySelect.value)
    applyFilters()
  })
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

  // ==== 新增：实时预览逻辑 ====
  const lightboxVideo = document.createElement('video')
  lightboxVideo.controls = true
  lightboxVideo.autoplay = true
  lightboxVideo.loop = true
  lightboxVideo.style.maxWidth = '90%'
  lightboxVideo.style.maxHeight = '80%'
  lightboxVideo.style.borderRadius = '10px'
  lightboxVideo.classList.add('hidden')

  lightbox.appendChild(lightboxVideo)

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.wallpaper-card')
    if (!card) return
    const file = card.dataset.file
    const url = `/img-wallpaper/wallpaper/full/${file}`

    if (file.endsWith('.mp4') || file.endsWith('.webm') || file.endsWith('.com')) {
      // 动态壁纸 → 用 video 播放
      lightboxImg.classList.add('hidden')
      lightboxVideo.classList.remove('hidden')
      lightboxVideo.src = url
    } else {
      // 静态壁纸 → 用 img 显示
      lightboxVideo.classList.add('hidden')
      lightboxImg.classList.remove('hidden')
      lightboxImg.src = url
    }

    downloadBtn.href = url
    lightbox.classList.remove('hidden')
  })

  lightbox.querySelector('.close').addEventListener('click', () => {
    lightbox.classList.add('hidden')
    lightboxVideo.pause() // 关闭时暂停视频
  })

  applyFilters()
})
