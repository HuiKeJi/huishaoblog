/* =============================
 * 前端 OCR 逻辑（Tesseract.js v5）
 * ============================= */
const fileInput = document.getElementById('fileInput')
const dropZone = document.getElementById('dropZone')
const langSelect = document.getElementById('langSelect')
const startBtn = document.getElementById('startBtn')
const fileNameEl = document.getElementById('fileName')
const progressBar = document.getElementById('progressBar')
const progressTxt = document.getElementById('progressText')
const resultBox = document.getElementById('resultBox')

let currentFile = null

/* 自动调整结果框高度 */
function autosize(textarea) {
  textarea.style.height = 'auto'
  const next = Math.min(textarea.scrollHeight, window.innerHeight * 0.7)
  textarea.style.height = next + 'px'
}

/* 文件选择 / 拖拽 / 粘贴事件 */
dropZone.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', (e) => {
  currentFile = e.target.files[0] || null
  fileNameEl.textContent = currentFile ? `已选择：${currentFile.name}` : '未选择文件'
})
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault()
  dropZone.classList.add('dz-hover')
})
dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault()
  dropZone.classList.remove('dz-hover')
})
dropZone.addEventListener('drop', (e) => {
  e.preventDefault()
  dropZone.classList.remove('dz-hover')
  const f = e.dataTransfer.files[0]
  if (f) {
    currentFile = f
    fileNameEl.textContent = `已选择：${f.name}`
  }
})
document.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items
  if (!items) return
  for (const it of items) {
    if (it.type.includes('image')) {
      currentFile = it.getAsFile()
      fileNameEl.textContent = '已粘贴一张图片'
      break
    }
  }
})

/* 复制结果 */
document.getElementById('copyBtn').addEventListener('click', async () => {
  const text = resultBox.value || ''
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
    else {
      resultBox.select()
      document.execCommand('copy')
    }
    alert('已复制到剪贴板 ✅')
  } catch {
    alert('复制失败，请手动复制')
  }
})

/* 模型检测函数：检查某个模型是否存在 */
async function checkModelExists(lang) {
  const url = `/lib/tessdata_best/${lang}.traineddata`
  try {
    const res = await fetch(url, { method: 'HEAD' })
    return res.ok
  } catch {
    return false
  }
}

/* 执行识别 */
startBtn.addEventListener('click', async () => {
  if (!currentFile) {
    alert('请先选择 / 拖拽 / 粘贴一张图片')
    return
  }

  // UI 初始化
  startBtn.disabled = true
  startBtn.textContent = '识别中…'
  progressBar.style.width = '0%'
  progressTxt.textContent = '进度：0%'
  resultBox.value = ''
  autosize(resultBox)

  // 识别语言
  let lang = langSelect.value
  if (lang === 'all') {
    // 通用模式：拼接 tessdata_best 下除 eng/chi_sim 外的全部模型
    const allModels = [
      'afr',
      'amh',
      'ara',
      'asm',
      'aze_cyrl',
      'aze',
      'bel',
      'ben',
      'bod',
      'bos',
      'bre',
      'bul',
      'cat',
      'ceb',
      'ces',
      'chr',
      'cos',
      'cym',
      'dan',
      'deu',
      'deu_latf',
      'div',
      'dzo',
      'ell',
      'enm',
      'epo',
      'equ',
      'est',
      'eus',
      'fao',
      'fas',
      'fil',
      'fin',
      'frk',
      'fra',
      'frm',
      'fry',
      'gla',
      'gle',
      'glg',
      'grc',
      'guj',
      'hat',
      'heb',
      'hin',
      'hrv',
      'hun',
      'hye',
      'iku',
      'ind',
      'isl',
      'ita',
      'ita_old',
      'jav',
      'jpn',
      'kan',
      'kat',
      'kat_old',
      'kaz',
      'khm',
      'kir',
      'kmr',
      'kor',
      'lao',
      'lat',
      'lav',
      'lit',
      'ltz',
      'mal',
      'mar',
      'mkd',
      'mlt',
      'mon',
      'mri',
      'msa',
      'mya',
      'nep',
      'nld',
      'nor',
      'oci',
      'ori',
      'osd',
      'pan',
      'pol',
      'por',
      'pus',
      'que',
      'ron',
      'rus',
      'san',
      'sin',
      'slk',
      'slv',
      'snd',
      'spa',
      'spa_old',
      'sqi',
      'srp',
      'srp_latn',
      'sun',
      'swa',
      'swe',
      'syr',
      'tam',
      'tat',
      'tel',
      'tgk',
      'tha',
      'tir',
      'ton',
      'tur',
      'uig',
      'ukr',
      'urd',
      'uzb',
      'uzb_cyrl',
      'vie',
      'yid',
      'yor',
    ]
    lang = allModels.join('+')
  }

  // ===== 检查所需模型是否存在 =====
  const langsToCheck = lang.split('+')
  for (const l of langsToCheck) {
    const ok = await checkModelExists(l)
    if (!ok) {
      // alert(`❌ 缺少模型文件：${l}.traineddata，请放到 /lib/tessdata_best/ 下`);
      alert(`服务器更新，无法使用，请留言`)
      startBtn.disabled = false
      startBtn.textContent = '开始识别'
      return
    }
  }

  // ===== 创建 worker =====
  let worker
  try {
    worker = await Tesseract.createWorker(lang, 1, {
      langPath: window.location.origin + '/lib/tessdata_best/',
      corePath: '/js/more-features/ocr/tesseract-core-simd-lstm.wasm.js',
      cacheMethod: 'none', // 禁止走 CDN fallback
      gzip: false, // 禁止请求 .gz
      logger: (m) => {
        if (m.status === 'recognizing text' && typeof m.progress === 'number') {
          const p = Math.round(m.progress * 100)
          progressBar.style.width = p + '%'
          progressTxt.textContent = `进度：${p}%`
        }
      },
    })
  } catch (err) {
    // alert('❌ 模型加载失败，请检查 /lib/tessdata_best/ 下是否有对应文件');
    alert(`服务器更新，无法使用，请留言`)
    console.error(err)
    startBtn.disabled = false
    startBtn.textContent = '开始识别'
    return
  }

  // ===== 开始识别 =====
  try {
    const ret = await worker.recognize(currentFile)
    const text = ret?.data?.text?.trim() || '⚠️ 没有识别到文字'
    resultBox.value = text
    progressBar.style.width = '100%'
    progressTxt.textContent = '进度：100%（完成 ✅）'
    autosize(resultBox)
  } catch (err) {
    console.error(err)
    resultBox.value = '❌ 识别失败：' + (err.message || err)
  } finally {
    await worker.terminate()
    startBtn.disabled = false
    startBtn.textContent = '开始识别'
  }
})
