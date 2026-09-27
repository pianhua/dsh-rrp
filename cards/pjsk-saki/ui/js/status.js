/* 天马咲希 · 现场 — 状态栏数据面：worldState 推送驱动，window.rrp 为唯一通道。 */
;(function () {
  'use strict'

  var ROSTER = [
    {
      key: 'ln',
      name: 'Leo/need',
      logo: 'assets/logo/LN-Logo.png',
      note: '星空下的四人乐队',
      members: [
        ['ichika', '星乃一歌', 'assets/profile/ln/Ichika.webp'],
        ['saki', '天马咲希', 'assets/profile/ln/Saki.webp'],
        ['honami', '望月穗波', 'assets/profile/ln/Honami.webp'],
        ['shiho', '日野森志步', 'assets/profile/ln/Shiho.webp'],
      ],
    },
    {
      key: 'mmj',
      name: 'MORE MORE JUMP!',
      logo: 'assets/logo/MMJ-Logo.png',
      note: '传递笑容的偶像',
      members: [
        ['minori', '花里实乃理', 'assets/profile/mmj/Minori.webp'],
        ['haruka', '桐谷遥', 'assets/profile/mmj/Haruka.webp'],
        ['airi', '桃井爱莉', 'assets/profile/mmj/Airi.webp'],
        ['shizuku', '日野森雫', 'assets/profile/mmj/Shizuku.webp'],
      ],
    },
    {
      key: 'vbs',
      name: 'Vivid BAD SQUAD',
      logo: 'assets/logo/VBS-Logo.png',
      note: '超越传说的街头',
      members: [
        ['kohane', '小豆泽心羽', 'assets/profile/vbs/Kohane.webp'],
        ['an', '白石杏', 'assets/profile/vbs/An.webp'],
        ['akito', '东云彰人', 'assets/profile/vbs/Akito.webp'],
        ['toya', '青柳冬弥', 'assets/profile/vbs/Toya.webp'],
      ],
    },
    {
      key: 'ws',
      name: 'Wonderlands×Showtime',
      logo: 'assets/logo/WS-Logo.png',
      note: '让全世界露出笑容',
      members: [
        ['tsukasa', '天马司', 'assets/profile/ws/Tsukasa.webp'],
        ['emu', '凤笑梦', 'assets/profile/ws/Emu.webp'],
        ['nene', '草薙宁宁', 'assets/profile/ws/Nene.webp'],
        ['rui', '神代类', 'assets/profile/ws/Rui.webp'],
      ],
    },
    {
      key: '25ji',
      name: '25时，Nightcord见。',
      logo: 'assets/logo/25ji-Logo.png',
      note: '深夜零时的真心话',
      members: [
        ['kanade', '宵崎奏', 'assets/profile/25/Kanade.webp'],
        ['mafuyu', '朝比奈真冬', 'assets/profile/25/Mafuyu.webp'],
        ['ena', '东云绘名', 'assets/profile/25/Ena.webp'],
        ['mizuki', '晓山瑞希', 'assets/profile/25/Mizuki.webp'],
      ],
    },
  ]

  var VIRTUAL_SINGERS = [
    ['miku', '初音未来', '#33CCBB'],
    ['rin', '镜音铃', '#FFCC11'],
    ['len', '镜音连', '#FFEE11'],
    ['luka', '巡音流歌', '#FFBBCC'],
    ['meiko', 'MEIKO', '#DD4444'],
    ['kaito', 'KAITO', '#3366CC'],
  ]

  var BACKGROUNDS = [
    'assets/bg/pjsk-PC.jpg',
    'assets/bg/pjsk-PC-2.png',
    'assets/bg/pjsk-PC-5.png',
    'assets/bg/pjsk-PC-9.png',
    'assets/bg/pjsk-PC-14.png',
    'assets/bg/pjsk-PC-20.png',
    'assets/bg/pjsk-PC-26.png',
  ]

  var latest = null
  var detailId = null
  var bgIndex = 0

  function el(tag, cls, text) {
    var node = document.createElement(tag)
    if (cls) node.className = cls
    if (text !== undefined) node.textContent = text
    return node
  }

  function affinityOf(state, id) {
    if (!state || !state.trackedObjects) return undefined
    var obj = state.trackedObjects[id]
    if (!obj) return undefined
    if (obj.character && typeof obj.character.affinity === 'number') return obj.character.affinity
    if (obj.fields && obj.fields.affinity && typeof obj.fields.affinity.value === 'number')
      return obj.fields.affinity.value
    return undefined
  }

  function conditionOf(state, id) {
    if (!state || !state.trackedObjects) return ''
    var obj = state.trackedObjects[id]
    if (!obj) return ''
    if (obj.character && obj.character.emotionalState) return obj.character.emotionalState
    if (obj.fields && obj.fields.condition && typeof obj.fields.condition.value === 'string')
      return obj.fields.condition.value
    return ''
  }

  function sceneLine(state) {
    if (!state || !state.trackedObjects) return '世界状态尚未建档'
    var parts = []
    for (var key in state.trackedObjects) {
      var obj = state.trackedObjects[key]
      if (obj.kind !== 'scene' || !obj.fields) continue
      var f = obj.fields
      if (f.location) parts.push(f.location.value)
      if (f.time) parts.push(f.time.value)
      if (f.weather) parts.push(f.weather.value)
      break
    }
    return parts.length > 0 ? parts.join(' · ') : '世界状态已连接'
  }

  function render() {
    var state = latest ? latest.state : null
    var roster = document.getElementById('roster')
    roster.textContent = ''
    for (var b = 0; b < ROSTER.length; b++) {
      var band = ROSTER[b]
      var head = el('div', 'band-head')
      var logo = el('img')
      logo.src = band.logo
      logo.alt = band.name
      head.appendChild(logo)
      head.appendChild(el('span', 'band-name', band.name))
      head.appendChild(el('span', 'band-note', band.note))
      roster.appendChild(head)

      var grid = el('div', 'member-grid')
      attachDragScroll(grid)
      for (var m = 0; m < band.members.length; m++) {
        var id = band.members[m][0]
        var name = band.members[m][1]
        var img = band.members[m][2]
        var aff = affinityOf(state, id)
        var card = el('div', 'member-card' + (aff === undefined ? ' unfiled' : ''))
        if (aff === undefined) card.appendChild(el('span', 'member-note', '未建档'))
        var pic = el('img')
        pic.src = img
        pic.alt = name
        card.appendChild(pic)
        var meta = el('div', 'member-meta')
        meta.appendChild(el('span', 'member-name', name))
        var ring = el('span', 'ring', aff === undefined ? '—' : String(Math.round(aff)))
        if (aff !== undefined) {
          var pct = ((aff + 100) / 200) * 100
          ring.style.setProperty('--p', String(Math.max(0, Math.min(100, pct))))
        }
        meta.appendChild(ring)
        card.appendChild(meta)
        ;(function (cid, cname, cimg) {
          card.addEventListener('click', function () {
            openDetail(cid, cname, cimg)
          })
        })(id, name, img)
        grid.appendChild(card)
      }
      roster.appendChild(grid)
    }

    var vsRow = document.getElementById('vs-row')
    vsRow.textContent = ''
    for (var v = 0; v < VIRTUAL_SINGERS.length; v++) {
      var chip = el('div', 'vs-chip')
      var dot = el('span', 'dot', VIRTUAL_SINGERS[v][0].slice(0, 1).toUpperCase())
      dot.style.background = VIRTUAL_SINGERS[v][2]
      chip.appendChild(dot)
      chip.appendChild(el('span', null, VIRTUAL_SINGERS[v][1]))
      vsRow.appendChild(chip)
    }

    document.getElementById('hud-scene').textContent = sceneLine(state)
    renderDetail()
  }

  function openDetail(id, name, img) {
    detailId = id
    document.getElementById('detail-img').src = img
    document.getElementById('detail-name').textContent = name
    var pop = document.getElementById('detail-pop')
    pop.hidden = false
    renderDetail()
    if (window.rrp) window.rrp.resize()
  }

  function renderDetail() {
    if (detailId === null) return
    var state = latest ? latest.state : null
    var aff = affinityOf(state, detailId)
    document.getElementById('detail-affinity').textContent =
      aff === undefined ? '未建档' : '好感 ' + Math.round(aff)
    var note = conditionOf(state, detailId)
    document.getElementById('detail-state').textContent =
      note || (aff === undefined ? '剧情涉及后由推演自动建档' : '（无状态记录）')
  }

  function nudge(delta) {
    if (!window.rrp || detailId === null) return
    var state = latest ? latest.state : null
    var current = affinityOf(state, detailId)
    var next = Math.max(-100, Math.min(100, (current === undefined ? 0 : current) + delta))
    var patch = { trackedObjects: {} }
    patch.trackedObjects[detailId] = { character: { affinity: next } }
    window.rrp.correctState(patch)
  }

  function attachDragScroll(grid) {
    var down = false
    var startX = 0
    var startLeft = 0
    grid.addEventListener('mousedown', function (e) {
      down = true
      startX = e.clientX
      startLeft = grid.scrollLeft
      grid.classList.add('dragging')
    })
    window.addEventListener('mousemove', function (e) {
      if (!down) return
      grid.scrollLeft = startLeft - (e.clientX - startX)
    })
    window.addEventListener('mouseup', function () {
      down = false
      grid.classList.remove('dragging')
    })
  }

  function rotateBackground() {
    var layer = document.getElementById('bg-layer')
    var probe = new Image()
    probe.onload = function () {
      layer.style.backgroundImage = "url('" + BACKGROUNDS[bgIndex] + "')"
      layer.classList.add('on')
      bgIndex = (bgIndex + 1) % BACKGROUNDS.length
    }
    probe.onerror = function () {
      bgIndex = (bgIndex + 1) % BACKGROUNDS.length
    }
    probe.src = BACKGROUNDS[bgIndex]
  }

  function boot() {
    if (!window.rrp) {
      setTimeout(boot, 50)
      return
    }
    rotateBackground()
    setInterval(rotateBackground, 8000)
    window.rrp.onState(function (msg) {
      latest = msg
      var sync = document.getElementById('hud-sync')
      sync.textContent = 'live · ' + (msg.card ? msg.card.name : '')
      sync.classList.add('live')
      render()
      if (window.rrp) window.rrp.resize()
    })
    document.getElementById('detail-close').addEventListener('click', function () {
      detailId = null
      document.getElementById('detail-pop').hidden = true
      if (window.rrp) window.rrp.resize()
    })
    document.getElementById('detail-plus').addEventListener('click', function () {
      nudge(5)
    })
    document.getElementById('detail-minus').addEventListener('click', function () {
      nudge(-5)
    })
    render()
  }

  boot()
})()
