/* global window, setInterval, clearInterval, setTimeout */
/**
 * dsh-rrp stage-kit — official runtime helpers for card-authored stage pages.
 *
 * Keeps cards small: common CSS classes live in kit.css, and this file provides
 * a tiny `window.rrpKit` surface for handshake waiting and display formatting.
 */
;(function () {
  'use strict'

  function ready(callback) {
    if (typeof callback !== 'function') return
    if (window.rrp && window.rrp.protocol) {
      callback(window.rrp)
      return
    }
    var timer = setInterval(function () {
      if (window.rrp && window.rrp.protocol) {
        clearInterval(timer)
        callback(window.rrp)
      }
    }, 50)
    setTimeout(function () {
      clearInterval(timer)
    }, 10000)
  }

  function fmtNumber(value, digits) {
    var n = Number(value)
    if (!Number.isFinite(n)) return String(value)
    var fixed = n.toFixed(digits === undefined ? 0 : digits)
    return fixed.replace(/\.0+$/, '')
  }

  function fmtPercent(value, digits) {
    var n = Number(value)
    if (!Number.isFinite(n)) return String(value)
    return fmtNumber(n * 100, digits === undefined ? 0 : digits) + '%'
  }

  window.rrpKit = {
    ready: ready,
    fmt: {
      number: fmtNumber,
      percent: fmtPercent,
      text: function (value) {
        return value === null || value === undefined ? '' : String(value).trim()
      },
    },
  }
})()
