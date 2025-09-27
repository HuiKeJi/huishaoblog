;(function () {
  const STORAGE_KEY = 'editor-md-autosave' // 本地存储草稿
  const THEME_KEY = 'editor-md-theme' // 本地存储主题
  const AUTOSAVE_MS = 2000 // 自动保存间隔(ms)
  let editor,
    dirty = false,
    autosaveTimer

  // 1) 载入草稿
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) document.getElementById('md-seed').value = saved

  // 2) 载入主题
  const savedTheme = localStorage.getItem(THEME_KEY) || 'default'
  applyTheme(savedTheme)
  document.getElementById('theme-select').value = savedTheme

  // 3) 初始化 Editor.md
  editor = editormd('editor', {
    width: '100%',
    height: '100%',
    path: '/lib/editor.md/lib/',
    markdown: document.getElementById('md-seed').value,
    emoji: true,
    taskList: true,
    tex: true,
    flowChart: true,
    sequenceDiagram: true,
    toc: true,
    tocm: true,
    codeFold: true,
    searchReplace: true,
    watch: true, // 开启实时预览
    syncScrolling: 'single', // 内置：编辑区 -> 预览区
    saveHTMLToTextarea: true,
    imageUpload: false,
    placeholder: '在这里输入 Markdown 内容...',
    toolbarIcons: 'full',
    onfullscreen: () => document.body.classList.add('fullscreen'),
    onfullscreenExit: () => document.body.classList.remove('fullscreen'),
    onchange: () => {
      setDirty(true)
      updateWordCount()
    },
    onload: function () {
      this.resize('100%', '100%')
      updateWordCount()

      // 4) ★★ 双向同步滚动（稳定实现）★★
      // 关键点：
      // - CodeMirror 用官方 API 读/设滚动：getScrollInfo() / scrollTo()
      // - 预览区真正滚动层是 .editormd-preview（不是 previewContainer）
      const cm = this.cm
      const cmEl = cm.getScrollerElement() // 编辑区滚动层 DOM
      const pvEl =
        this.preview && this.preview.length
          ? this.preview[0] // jQuery 对象取原生 DOM
          : this.previewContainer
          ? this.previewContainer.parentNode
          : null

      if (!pvEl) {
        console.warn('未找到预览滚动层，双向同步未启用')
        return
      }

      let lock = false // 锁避免相互递归触发

      // 计算百分比的安全函数：避免除以 0
      function ratio(top, height, client) {
        const denom = Math.max(1, height - client)
        return Math.min(1, Math.max(0, top / denom))
      }

      // 编辑区 -> 预览区
      cm.on('scroll', () => {
        if (lock) return
        lock = true
        const info = cm.getScrollInfo()
        const p = ratio(info.top, info.height, info.clientHeight)
        pvEl.scrollTop = p * (pvEl.scrollHeight - pvEl.clientHeight)
        // 微延迟释放锁，避免在极短时间内来回抖动
        setTimeout(() => (lock = false), 16)
      })

      // 预览区 -> 编辑区
      pvEl.addEventListener(
        'scroll',
        () => {
          if (lock) return
          lock = true
          const info = cm.getScrollInfo()
          const p = ratio(pvEl.scrollTop, pvEl.scrollHeight, pvEl.clientHeight)
          cm.scrollTo(null, p * (info.height - info.clientHeight))
          setTimeout(() => (lock = false), 16)
        },
        {
          passive: true,
        }
      )
    },
  })

  // 主题切换
  document.getElementById('theme-select').addEventListener('change', (e) => {
    const theme = e.target.value
    applyTheme(theme)
    localStorage.setItem(THEME_KEY, theme)
  })

  function applyTheme(theme) {
    document.body.className = theme === 'default' ? '' : `theme-${theme}`
  }

  // 顶栏按钮逻辑
  document.getElementById('btn-new').addEventListener('click', () => {
    if (confirm('确定清空内容吗？')) {
      editor.clear()
      performSave(true)
    }
  })
  document.getElementById('btn-download').addEventListener('click', () => {
    const md = editor.getMarkdown()
    downloadFile(md, 'hui shao.md', 'text/markdown;charset=utf-8')
  })
  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('file-input').click()
  })
  document.getElementById('file-input').addEventListener('change', (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      editor.setMarkdown(evt.target.result)
      performSave(true)
    }
    reader.readAsText(file)
    e.target.value = ''
  })
  document.getElementById('btn-export-html').addEventListener('click', () => {
    const html = editor.getHTML()
    const fullHtml = `<!DOCTYPE html>
              <html lang="zh-CN">
              <head>
              <meta charset="UTF-8">
              <title>导出文档</title>
              <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/editor.md@1.5.0/css/editormd.preview.min.css" />
              </head>
              <body>
              <div class="markdown-body editormd-html-preview">${html}</div>
              </body>
              </html>`
    downloadFile(fullHtml, 'huishao.html', 'text/html;charset=utf-8')
  })
  document.getElementById('btn-export-pdf').addEventListener('click', () => {
    const html = editor.getPreviewedHTML()
    const element = document.createElement('div')
    element.innerHTML = `<div class="markdown-body editormd-html-preview">${html}</div>`
    const opt = {
      margin: 10,
      filename: 'huishao.pdf',
      html2canvas: {
        scale: 2,
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait',
      },
    }
    html2pdf().set(opt).from(element).save()
  })

  // 工具函数：下载文件
  function downloadFile(content, filename, type) {
    const blob = new Blob([content], {
      type,
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // 自动保存
  function setDirty(v) {
    dirty = v
    document.getElementById('save-status').textContent = v ? '有未保存…' : '已保存'
    if (v) {
      clearTimeout(autosaveTimer)
      autosaveTimer = setTimeout(() => performSave(false), AUTOSAVE_MS)
    }
  }

  function performSave(force) {
    const md = editor.getMarkdown()
    localStorage.setItem(STORAGE_KEY, md)
    setDirty(false)
    if (force) document.getElementById('save-status').textContent = '已保存'
  }
  window.addEventListener('beforeunload', (e) => {
    if (dirty) {
      e.preventDefault()
      e.returnValue = ''
    }
  })

  // 字数统计
  function updateWordCount() {
    const text = editor.getMarkdown().replace(/\s+/g, '')
    const count = text.length
    const minutes = Math.ceil(count / 200)
    document.getElementById('word-count').textContent = `字数: ${count} | 预计阅读: ${minutes} 分钟`
  }
})()
