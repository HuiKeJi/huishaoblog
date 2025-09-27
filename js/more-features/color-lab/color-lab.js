document.addEventListener('DOMContentLoaded', () => {
  /* ========== 绑定所有需要的 DOM ========== */
  const colorInput = document.getElementById('colorInput')
  const colorHex = document.getElementById('colorHex')
  const dropZone = document.getElementById('dropZone')
  const fileNameEl = document.getElementById('fileName')
  const imgPreview = document.getElementById('imgPreview')
  const clearImg = document.getElementById('clearImg')

  const colorBox = document.getElementById('colorBox')
  const colorSample = document.getElementById('colorSample')
  const hexVal = document.getElementById('hexVal')
  const rgbVal = document.getElementById('rgbVal')
  const hslVal = document.getElementById('hslVal')
  const copyHEX = document.getElementById('copyHEX')
  const applyToGen = document.getElementById('applyToGen')

  const outW = document.getElementById('outW')
  const outH = document.getElementById('outH')
  // const genBtn = document.getElementById('genBtn');
  const dlLink = document.getElementById('dlLink')
  const previewCv = document.getElementById('previewCanvas')
  const pctx = previewCv.getContext('2d')

  const searchInput = document.getElementById('searchInput')
  const grid = document.getElementById('paletteGrid')
  const moreBtn = document.getElementById('moreBtn')

  /* ========== 工具函数：颜色转换 ========== */
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')
  }

  function rgbToHsl(r, g, b) {
    r /= 255
    g /= 255
    b /= 255
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b)
    let h,
      s,
      l = (max + min) / 2
    if (max === min) {
      h = s = 0
    } else {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0)
          break
        case g:
          h = (b - r) / d + 2
          break
        case b:
          h = (r - g) / d + 4
          break
      }
      h /= 6
    }
    return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`
  }

  function hslToHex(h, s, l) {
    s /= 100
    l /= 100
    const C = (1 - Math.abs(2 * l - 1)) * s
    const X = C * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = l - C / 2
    let [r, g, b] = [0, 0, 0]
    if (h < 60) {
      r = C
      g = X
    } else if (h < 120) {
      r = X
      g = C
    } else if (h < 180) {
      g = C
      b = X
    } else if (h < 240) {
      g = X
      b = C
    } else if (h < 300) {
      r = X
      b = C
    } else {
      r = C
      b = X
    }
    const R = Math.round((r + m) * 255)
      .toString(16)
      .padStart(2, '0')
    const G = Math.round((g + m) * 255)
      .toString(16)
      .padStart(2, '0')
    const B = Math.round((b + m) * 255)
      .toString(16)
      .padStart(2, '0')
    return '#' + R + G + B
  }

  /* ========== 颜色输入联动、预览与下载 ========== */
  function drawPreviewAndPrepareDownload() {
    // 小预览画布：固定小尺寸，仅为看色，避免占位
    const vw = 320,
      vh = 200
    previewCv.width = vw
    previewCv.height = vh
    pctx.fillStyle = colorHex.value
    pctx.fillRect(0, 0, vw, vh)

    // 下载：使用“原分辨率”导出（离屏画布）
    const W = Math.max(1, parseInt(outW.value) || 800)
    const H = Math.max(1, parseInt(outH.value) || 600)
    const fmt = document.querySelector('input[name="fmt"]:checked').value

    const off = document.createElement('canvas')
    off.width = W
    off.height = H
    const octx = off.getContext('2d')
    octx.fillStyle = colorHex.value
    octx.fillRect(0, 0, W, H)

    dlLink.href = off.toDataURL('image/' + fmt)
    dlLink.download = 'color.' + fmt
  }

  colorInput.addEventListener('input', () => {
    colorHex.value = colorInput.value
    drawPreviewAndPrepareDownload()
  })
  colorHex.addEventListener('input', () => {
    if (/^#([0-9A-Fa-f]{6})$/.test(colorHex.value)) {
      colorInput.value = colorHex.value
      drawPreviewAndPrepareDownload()
    }
  })
  // genBtn.addEventListener('click', drawPreviewAndPrepareDownload);
  document
    .querySelectorAll('input[name="fmt"]')
    .forEach((r) => r.addEventListener('change', drawPreviewAndPrepareDownload))
  document.querySelectorAll('[data-w]').forEach((btn) => {
    btn.addEventListener('click', () => {
      outW.value = btn.dataset.w
      outH.value = btn.dataset.h
      drawPreviewAndPrepareDownload()
    })
  })
  ;[outW, outH].forEach((el) => el.addEventListener('input', drawPreviewAndPrepareDownload))

  // 初始化一次
  drawPreviewAndPrepareDownload()

  /* ========== 图片拖拽/点击上传 ========== */
  function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return
    fileNameEl.textContent = file.name

    const reader = new FileReader()
    reader.onload = (ev) => {
      imgPreview.src = ev.target.result
      imgPreview.style.display = 'block'
      clearImg.style.display = 'inline-block'
      colorBox.style.display = 'none' // 先隐藏，待第一次点击取色再显示

      // 绘制到离屏画布用于采样像素
      const tmp = document.createElement('canvas')
      const tctx = tmp.getContext('2d')
      imgPreview.onload = () => {
        tmp.width = imgPreview.naturalWidth
        tmp.height = imgPreview.naturalHeight
        tctx.drawImage(imgPreview, 0, 0)

        // 点击图片任意位置取色
        imgPreview.onclick = (e) => {
          const rect = imgPreview.getBoundingClientRect()
          const x = Math.floor((e.clientX - rect.left) * (imgPreview.naturalWidth / rect.width))
          const y = Math.floor((e.clientY - rect.top) * (imgPreview.naturalHeight / rect.height))
          const d = tctx.getImageData(x, y, 1, 1).data
          const hex = rgbToHex(d[0], d[1], d[2])
          const rgb = `rgb(${d[0]}, ${d[1]}, ${d[2]})`
          const hsl = rgbToHsl(d[0], d[1], d[2])
          colorSample.style.background = hex
          hexVal.textContent = 'HEX：' + hex
          rgbVal.textContent = 'RGB：' + rgb
          hslVal.textContent = 'HSL：' + hsl
          colorBox.style.display = 'block'
          // 记录当前取到的 HEX 以便复制/应用
          copyHEX.dataset.val = hex
        }
      }
    }
    reader.readAsDataURL(file)
  }

  dropZone.addEventListener('click', () => {
    const inp = document.createElement('input')
    inp.type = 'file'
    inp.accept = 'image/*'
    inp.onchange = () => handleFile(inp.files[0])
    inp.click()
  })
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault()
    dropZone.classList.add('dragover')
  })
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'))
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault()
    dropZone.classList.remove('dragover')
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0])
  })

  // 清除图片：隐藏预览与颜色框，并清空文件名
  clearImg.addEventListener('click', () => {
    imgPreview.src = ''
    imgPreview.style.display = 'none'
    clearImg.style.display = 'none'
    colorBox.style.display = 'none'
    fileNameEl.textContent = ''
  })

  // 复制 / 应用到生成器
  copyHEX.addEventListener('click', () => {
    const val = copyHEX.dataset.val
    if (!val) return
    navigator.clipboard.writeText(val)
    copyHEX.textContent = '已复制'
    setTimeout(() => (copyHEX.textContent = '复制 HEX'), 1200)
  })
  applyToGen.addEventListener('click', () => {
    const val = copyHEX.dataset.val
    if (!val) return
    colorHex.value = val
    colorInput.value = val
    drawPreviewAndPrepareDownload()
  })

  /* ========== 配色大全：HSL 采样 + 搜索 + 加载更多 ========== */
  // 说明：一次渲染过多会卡顿，这里按“批次”生成，点击“加载更多颜色”继续扩展网格。
  let batch = 0 // 当前批次（越大越密）
  const H_STEPS = [30, 20, 12, 8, 6] // 各批次的色相步进：越往后越细
  const SL_STEPS = [20, 16, 12, 10, 8] // 各批次的饱和/明度步进（百分比）

  // 可选名称库（可自行追加更多中文色名）
  const NAMED = [
    {
      name: '黑',
      hex: '#000000',
    },
    {
      name: '白',
      hex: '#FFFFFF',
    },
    {
      name: '红',
      hex: '#FF0000',
    },
    {
      name: '绿',
      hex: '#008000',
    },
    {
      name: '蓝',
      hex: '#0000FF',
    },
    {
      name: '青',
      hex: '#00FFFF',
    },
    {
      name: '黄',
      hex: '#FFFF00',
    },
    {
      name: '品红',
      hex: '#FF00FF',
    },
    {
      name: '灰',
      hex: '#808080',
    },
    {
      name: '橙',
      hex: '#FFA500',
    },
    {
      name: '紫',
      hex: '#800080',
    },
    {
      name: '粉',
      hex: '#FFC0CB',
    },
    {
      name: '金',
      hex: '#FFD700',
    },
    {
      name: '银',
      hex: '#C0C0C0',
    },
    {
      name: '绛紫',
      hex: '#8C4356',
    },
    {
      name: '月白',
      hex: '#D6ECF0',
    },
    {
      name: '天青',
      hex: '#1089E7',
    },
  ]

  // 渲染一个批次的 HSL 色卡
  function renderBatch() {
    const hStep = H_STEPS[Math.min(batch, H_STEPS.length - 1)]
    const slStep = SL_STEPS[Math.min(batch, SL_STEPS.length - 1)]
    const items = []
    for (let h = 0; h < 360; h += hStep) {
      for (let s = slStep; s <= 100; s += slStep) {
        for (let l = slStep; l <= 100; l += slStep) {
          const hex = hslToHex(h, s, l)
          items.push({
            name: `HSL(${h},${s}%,${l}%)`,
            hex,
          })
        }
      }
    }
    // 第一批把名称库放最前面，易于检索
    if (batch === 0) items.unshift(...NAMED)
    const frag = document.createDocumentFragment()
    items.forEach((c) => {
      const d = document.createElement('div')
      d.className = 'swatch'
      d.style.background = c.hex
      d.innerHTML = `
        <div>${c.name || ''}</div>
        <div>${c.hex}</div>
        <div class="ops">
          <button class="small-btn" data-copy="${c.hex}">复制</button>
          <button class="small-btn" data-apply="${c.hex}">应用</button>
        </div>`
      frag.appendChild(d)
    })
    grid.appendChild(frag)
  }

  // 初次与“加载更多”
  renderBatch()
  moreBtn.addEventListener('click', () => {
    batch++
    renderBatch()
  })

  // 颜色卡点击事件：复制/应用
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.small-btn')
    if (!btn) return
    if (btn.dataset.copy) {
      navigator.clipboard.writeText(btn.dataset.copy)
      btn.textContent = '已复制'
      setTimeout(() => (btn.textContent = '复制'), 1200)
    } else if (btn.dataset.apply) {
      const hx = btn.dataset.apply
      colorHex.value = hx
      colorInput.value = hx
      drawPreviewAndPrepareDownload()
    }
  })

  // 搜索：对已渲染网格做模糊筛选（名称/HEX/HSL 字符串）
  searchInput.addEventListener('input', () => {
    const kw = searchInput.value.trim().toLowerCase()
    ;[...grid.children].forEach((card) => {
      const text = card.textContent.toLowerCase()
      card.style.display = text.includes(kw) ? '' : 'none'
    })
  })
})
