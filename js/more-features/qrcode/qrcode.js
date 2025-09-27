/* ================= 功能切换 ================= */
function showTab(tab) {
  document.querySelectorAll('.generator').forEach((el) => el.classList.remove('active'))
  document.getElementById(tab + 'Gen').classList.add('active')
}

/* ================= 公共渲染函数 ================= */
function renderToImg(canvas, outDiv, filename, type, logoUrl, logoScale = 0.25) {
  const ctx = canvas.getContext('2d')
  if (logoUrl && type === 'qrcode') {
    const logo = new Image()
    logo.onload = () => {
      const size = canvas.width * logoScale
      ctx.drawImage(logo, (canvas.width - size) / 2, (canvas.height - size) / 2, size, size)
      insertPreview(canvas, outDiv, filename)
    }
    logo.src = logoUrl
  } else {
    insertPreview(canvas, outDiv, filename)
  }
}

function insertPreview(canvas, outDiv, filename) {
  const img = document.createElement('img')
  img.src = canvas.toDataURL('image/png')
  img.alt = filename
  img.style.marginTop = '15px'
  img.style.maxWidth = '400px'
  img.style.cursor = 'pointer'
  img.title = '📱 长按保存 ' + filename
  outDiv.innerHTML = ''
  outDiv.appendChild(img)
}

/* ================= 二维码生成 ================= */
let logoUrl = null
document
  .getElementById('logoDrop')
  .addEventListener('click', () => document.getElementById('logoInput').click())
document.getElementById('logoDrop').addEventListener('dragover', (e) => {
  e.preventDefault()
  e.currentTarget.classList.add('hover')
})
document
  .getElementById('logoDrop')
  .addEventListener('dragleave', (e) => e.currentTarget.classList.remove('hover'))
document.getElementById('logoDrop').addEventListener('drop', (e) => {
  e.preventDefault()
  handleLogoFile(e.dataTransfer.files[0])
})
document
  .getElementById('logoInput')
  .addEventListener('change', (e) => handleLogoFile(e.target.files[0]))

function handleLogoFile(file) {
  if (file) {
    logoUrl = URL.createObjectURL(file)
    document.getElementById('logoDrop').textContent = '已选择：' + file.name
  }
}

function makeQRCode() {
  const text = document.getElementById('qrInput').value.trim()
  if (!text) return alert('请输入内容')
  const qrDiv = document.getElementById('qrcode')
  qrDiv.innerHTML = ''
  const tmpDiv = document.createElement('div')
  new QRCode(tmpDiv, {
    text,
    width: 300,
    height: 300,
    colorDark: '#000',
    colorLight: '#fff',
  }) // 尺寸更大一圈
  setTimeout(() => {
    const canvas = tmpDiv.querySelector('canvas')
    if (canvas) {
      const scale = document.getElementById('logoSize').value / 100
      renderToImg(canvas, qrDiv, 'qrcode.png', 'qrcode', logoUrl, scale)
    }
  }, 200)
}

function downloadQR() {
  const img = document.querySelector('#qrcode img')
  if (!img) return alert('请先生成二维码')
  fetch(img.src)
    .then((res) => res.blob())
    .then((blob) => {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'qrcode.png'
      link.click()
      URL.revokeObjectURL(url)
    })
}

/* ================= 条码生成 ================= */
function makeBarcode() {
  const text = document.getElementById('barInput').value.trim()
  if (!text) return alert('请输入内容')
  const svg = document.getElementById('barcode')
  const out = document.getElementById('barcodeOut')
  svg.innerHTML = ''
  out.querySelectorAll('img').forEach((el) => el.remove())
  JsBarcode(svg, text, {
    format: 'CODE128',
    lineColor: '#000',
    width: 3,
    height: 120,
    displayValue: true,
  }) // 更大一圈
  // SVG ➝ PNG
  const serializer = new XMLSerializer()
  const svgStr = serializer.serializeToString(svg)
  const blob = new Blob([svgStr], {
    type: 'image/svg+xml;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const tmp = new Image()
  tmp.onload = function () {
    const canvas = document.createElement('canvas')
    canvas.width = tmp.width
    canvas.height = tmp.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(tmp, 0, 0)
    URL.revokeObjectURL(url)
    svg.style.display = 'none'
    const img = document.createElement('img')
    img.src = canvas.toDataURL('image/png')
    img.alt = '条码'
    img.style.maxWidth = '500px'
    img.style.cursor = 'pointer'
    img.title = '📱 长按保存条码'
    out.appendChild(img)
  }
  tmp.src = url
}

function downloadBar() {
  const img = document.querySelector('#barcodeOut img')
  if (!img) return alert('请先生成条码')
  fetch(img.src)
    .then((res) => res.blob())
    .then((blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'barcode.png'
      a.click()
      URL.revokeObjectURL(url)
    })
}

/* ===== 扫码识别（ZXing版） ===== */
document
  .getElementById('scanDrop')
  .addEventListener('click', () => document.getElementById('scanInput').click())
document.getElementById('scanDrop').addEventListener('dragover', (e) => {
  e.preventDefault()
  e.currentTarget.classList.add('hover')
})
document
  .getElementById('scanDrop')
  .addEventListener('dragleave', (e) => e.currentTarget.classList.remove('hover'))
document.getElementById('scanDrop').addEventListener('drop', (e) => {
  e.preventDefault()
  handleScanFile(e.dataTransfer.files[0])
})
document
  .getElementById('scanInput')
  .addEventListener('change', (e) => handleScanFile(e.target.files[0]))

function handleScanFile(file) {
  if (!file) return
  const reader = new FileReader()
  reader.onload = function (e) {
    const img = new Image()
    img.onload = function () {
      // 先尝试二维码识别
      const qrReader = new ZXing.BrowserQRCodeReader()
      qrReader
        .decodeFromImage(img)
        .then((result) => {
          document.getElementById('scanResult').textContent = '二维码内容：' + result.text
        })
        .catch(() => {
          // 再尝试条码识别
          const barReader = new ZXing.BrowserBarcodeReader()
          barReader
            .decodeFromImage(img)
            .then((result) => {
              document.getElementById('scanResult').textContent = '条码内容：' + result.text
            })
            .catch(() => {
              document.getElementById('scanResult').textContent =
                '未能识别，请换更清晰的二维码/条码'
            })
        })
    }
    img.src = e.target.result
  }
  reader.readAsDataURL(file)
}

/* ===== 复制结果 ===== */
function copyResult() {
  const result = document.getElementById('scanResult').textContent
  if (!result || result.includes('未能识别')) {
    alert('没有可复制的内容')
    return
  }
  navigator.clipboard
    .writeText(result.replace(/^(二维码内容：|条码内容：)/, ''))
    .then(() => alert('已复制结果'))
    .catch(() => alert('复制失败'))
}
