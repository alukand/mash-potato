// Startup-crash net: if the app JS throws before React ever mounts (e.g.
// missing env config in a release build), #root stays empty forever with no
// visible signal. This shows the actual error instead of a blank screen —
// critical on iOS where there's no console to check.
//
// It lives in a FILE rather than inline so a strict `script-src 'self'` CSP
// covers it. The alternative — pinning a sha256 of the inline source — breaks
// silently the moment anyone edits this script, which would disable the very
// thing that reports startup failures.
//
// Loaded as a classic (blocking) script before the module bundle, so the
// listeners are registered before anything can throw.
;(function () {
  function show(msg) {
    var root = document.getElementById('root')
    if (root && root.childElementCount === 0) {
      root.innerHTML =
        '<div style="min-height:100dvh;display:flex;flex-direction:column;' +
        'align-items:center;justify-content:center;padding:24px;text-align:center;' +
        'font-family:-apple-system,system-ui,sans-serif;color:#f3eee5;">' +
        '<p style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;' +
        "color:#9c93ab;margin-bottom:12px;\">Mash Potato couldn't start</p>" +
        '<p style="max-width:320px;font-size:13px;line-height:1.5;color:#e07a5f;">' +
        msg +
        '</p></div>'
    }
  }
  window.addEventListener('error', function (e) {
    show((e && e.message) || 'Unknown startup error.')
  })
  window.addEventListener('unhandledrejection', function (e) {
    var reason = e && e.reason
    show((reason && reason.message) || String(reason) || 'Unknown startup error.')
  })
})()
