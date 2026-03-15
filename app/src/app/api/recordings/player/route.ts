export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return new Response("Missing sessionId", { status: 400 });
  }

  const shortId = sessionId.slice(0, 8);

  // Data is fetched client-side from /api/recordings to avoid any script injection issues
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Session ${shortId}</title>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    html, body {
      width: 100%; height: 100%;
      background: #0a0a0a;
      overflow: hidden;
      font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
    }

    #app {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
    }

    /* ── Replay viewport ── */
    #player-area {
      flex: 1;
      position: relative;
      overflow: hidden;
      background: #050505;
    }

    #replayer-root {
      width: 100%;
      height: 100%;
    }

    /* Scale the rrweb iframe to fit */
    .replayer-wrapper {
      position: absolute !important;
      transform-origin: top left;
    }

    /* Fix rrweb 1.x in-flow stacking: mouse + canvas must be absolute
       so the iframe is at the top of the wrapper, not pushed below */
    .replayer-wrapper > .replayer-mouse,
    .replayer-wrapper > .replayer-mouse-tail {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      pointer-events: none !important;
      z-index: 2 !important;
    }

    .replayer-wrapper > iframe {
      position: relative !important;
      z-index: 1 !important;
    }

    /* Mouse cursor styling */
    .replayer-mouse {
      border: 2px solid #E8FF00 !important;
      background: rgba(232,255,0,0.2) !important;
      width: 20px !important;
      height: 20px !important;
    }
    .replayer-mouse::after {
      background: #E8FF00 !important;
    }
    .replayer-mouse-tail {
      stroke: rgba(232,255,0,0.5) !important;
    }
    .replayer-mouse.active {
      box-shadow: 0 0 10px rgba(232,255,0,0.4) !important;
    }

    /* ── State overlay ── */
    #overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      z-index: 100;
      background: #0a0a0a;
      pointer-events: none;
    }
    #overlay.hidden { display: none; }
    #overlay .o-icon {
      width: 36px; height: 36px;
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; font-weight: bold;
    }
    #overlay .o-text { font-size: 11px; color: #555; letter-spacing: 0.06em; text-transform: uppercase; }
    #overlay .o-sub  { font-size: 10px; color: #333; letter-spacing: 0.03em; }
    .o-loading .o-icon { background: rgba(232,255,0,0.08); color: #E8FF00; }
    .o-error   .o-icon { background: rgba(239,68,68,0.08);  color: #EF4444; }
    .o-empty   .o-icon { background: rgba(85,85,85,0.08);   color: #333;    }

    /* ── Controls bar ── */
    #controls {
      flex-shrink: 0;
      background: #111;
      border-top: 1px solid #1a1a1a;
      padding: 8px 14px 10px;
      flex-direction: column;
      gap: 8px;
      display: none;
    }
    #controls.show { display: flex; }

    /* Progress track */
    #progress {
      position: relative;
      height: 3px;
      background: #1e1e1e;
      border-radius: 2px;
      cursor: pointer;
      transition: height 0.12s;
    }
    #progress:hover { height: 5px; }
    #progress-fill {
      height: 100%;
      background: #E8FF00;
      border-radius: 2px;
      width: 0%;
      pointer-events: none;
    }
    #progress-handle {
      position: absolute;
      top: 50%;
      left: 0%;
      width: 10px; height: 10px;
      background: #E8FF00;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
      box-shadow: 0 0 8px rgba(232,255,0,0.6);
      opacity: 0;
      transition: opacity 0.12s;
    }
    #progress:hover #progress-handle { opacity: 1; }

    /* Bottom row */
    #ctrl-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    /* Play/pause */
    #btn-play {
      width: 26px; height: 26px;
      background: rgba(232,255,0,0.1);
      border: 1px solid rgba(232,255,0,0.15);
      border-radius: 50%;
      color: #E8FF00;
      font-size: 9px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      transition: background 0.12s;
    }
    #btn-play:hover { background: rgba(232,255,0,0.2); }

    /* Time */
    #time {
      font-size: 10px;
      color: #444;
      letter-spacing: 0.04em;
      flex: 1;
    }
    #time .t-cur { color: #E8FF00; }

    /* Speed buttons */
    #speeds { display: flex; gap: 1px; }
    .s-btn {
      background: transparent;
      border: none;
      color: #383838;
      font-size: 10px;
      font-family: inherit;
      padding: 2px 7px;
      border-radius: 3px;
      cursor: pointer;
      letter-spacing: 0.02em;
      transition: all 0.1s;
    }
    .s-btn:hover  { color: #666; background: rgba(255,255,255,0.04); }
    .s-btn.active { color: #E8FF00; background: rgba(232,255,0,0.1); }

    /* Skip toggle */
    #skip-wrap {
      display: flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      user-select: none;
    }
    #skip-track {
      width: 26px; height: 14px;
      background: #1e1e1e;
      border-radius: 7px;
      position: relative;
      transition: background 0.2s;
      flex-shrink: 0;
    }
    #skip-track::after {
      content: '';
      position: absolute;
      left: 2px; top: 2px;
      width: 10px; height: 10px;
      background: #333;
      border-radius: 50%;
      transition: all 0.2s;
    }
    #skip-wrap.on #skip-track { background: rgba(232,255,0,0.15); }
    #skip-wrap.on #skip-track::after { left: 14px; background: #E8FF00; }
    #skip-label { font-size: 10px; color: #333; }
  </style>
</head>
<body>
  <div id="app">
    <div id="player-area">
      <div id="replayer-root"></div>
      <div id="overlay" class="o-loading">
        <div class="o-icon">▶</div>
        <div class="o-text">Loading</div>
        <div class="o-sub">${shortId}</div>
      </div>
    </div>

    <div id="controls">
      <div id="progress">
        <div id="progress-fill"></div>
        <div id="progress-handle"></div>
      </div>
      <div id="ctrl-row">
        <button id="btn-play">▶</button>
        <div id="time"><span class="t-cur">0:00</span>&nbsp;/&nbsp;<span class="t-tot">0:00</span></div>
        <div id="speeds">
          <button class="s-btn active" data-s="1">1×</button>
          <button class="s-btn" data-s="2">2×</button>
          <button class="s-btn" data-s="4">4×</button>
          <button class="s-btn" data-s="8">8×</button>
        </div>
        <div id="skip-wrap" class="on">
          <div id="skip-track"></div>
          <div id="skip-label">skip inactive</div>
        </div>
      </div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/rrweb@1.1.3/dist/rrweb.min.js"></script>
  <script>
  (function () {
    var overlay   = document.getElementById('overlay');
    var controls  = document.getElementById('controls');
    var progress  = document.getElementById('progress');
    var pFill     = document.getElementById('progress-fill');
    var pHandle   = document.getElementById('progress-handle');
    var btnPlay   = document.getElementById('btn-play');
    var timeCur   = document.querySelector('#time .t-cur');
    var timeTot   = document.querySelector('#time .t-tot');
    var skipWrap  = document.getElementById('skip-wrap');
    var playerArea = document.getElementById('player-area');
    var root       = document.getElementById('replayer-root');

    function fmt(ms) {
      var s = Math.floor(Math.max(0, ms) / 1000);
      var m = Math.floor(s / 60);
      return m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
    }

    function showOverlay(type, msg, sub) {
      overlay.className = type;
      overlay.innerHTML =
        '<div class="o-icon">' + (type === 'o-error' ? '✕' : type === 'o-empty' ? '—' : '▶') + '</div>' +
        '<div class="o-text">' + msg + '</div>' +
        (sub ? '<div class="o-sub">' + sub + '</div>' : '');
    }

    // Fetch recording data from the dedicated JSON endpoint
    fetch('/api/recordings?sessionId=${sessionId}')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (raw) {
        var events = (Array.isArray(raw) ? raw : []).filter(function (e) {
          return e && typeof e.type === 'number' && typeof e.timestamp === 'number';
        });
        if (events.length === 0) {
          showOverlay('o-empty', 'No recording', 'May still be processing');
          return;
        }
        initPlayer(events);
      })
      .catch(function (err) {
        showOverlay('o-error', 'Failed to load', String(err.message || err));
      });

    function initPlayer(events) {
      var skipInactive = true;
      var speed = 1;

      var replayer = new rrweb.Replayer(events, {
        root: root,
        speed: speed,
        skipInactive: skipInactive,
        showWarning: false,
        showDebug: false,
        triggerFocus: false,
        mouseTail: { duration: 500, strokeStyle: 'rgba(232,255,0,0.4)' }
      });

      var meta = replayer.getMetaData();
      var total = meta.totalTime;
      timeTot.textContent = fmt(total);

      // Scale replayer iframe to fill player-area
      function scale() {
        var wrapper = root.querySelector('.replayer-wrapper');
        if (!wrapper) return;
        var iframe = wrapper.querySelector('iframe');
        if (!iframe) return;
        var iW = parseFloat(iframe.getAttribute('width') || '1280') || 1280;
        var iH = parseFloat(iframe.getAttribute('height') || '720') || 720;
        var aW = playerArea.clientWidth;
        var aH = playerArea.clientHeight;
        var s = Math.min(aW / iW, aH / iH);
        wrapper.style.transform = 'scale(' + s + ')';
        wrapper.style.left = Math.max(0, (aW - iW * s) / 2) + 'px';
        wrapper.style.top  = Math.max(0, (aH - iH * s) / 2) + 'px';
      }
      window.addEventListener('resize', scale);

      // Play briefly then pause to render first frame
      replayer.play(0);
      setTimeout(function () {
        replayer.pause();
        overlay.classList.add('hidden');
        controls.classList.add('show');
        // Scale after controls are shown so player-area has correct final height
        requestAnimationFrame(scale);
      }, 400);

      // ── Time tracking ──
      var isPlaying    = false;
      var startWall    = 0;
      var curOffset    = 0;
      var raf;
      var pendingSeekX = null;

      function getCur() {
        if (!isPlaying) return curOffset;
        return Math.min(curOffset + (Date.now() - startWall) * speed, total);
      }

      function updateUI() {
        var c = getCur();
        var pct = total > 0 ? (c / total * 100) : 0;
        pFill.style.width  = pct + '%';
        pHandle.style.left = pct + '%';
        timeCur.textContent = fmt(c);
      }

      function tick() {
        if (pendingSeekX !== null) { seek(pendingSeekX); pendingSeekX = null; }
        updateUI();
        if (isPlaying) raf = requestAnimationFrame(tick);
      }

      function play(fromOffset) {
        if (fromOffset !== undefined) curOffset = fromOffset;
        startWall  = Date.now();
        isPlaying  = true;
        btnPlay.textContent = '⏸';
        replayer.play(curOffset);
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(tick);
      }

      function pause() {
        curOffset = getCur();
        isPlaying = false;
        btnPlay.textContent = '▶';
        replayer.pause();
        cancelAnimationFrame(raf);
        updateUI();
      }

      replayer.on('finish', function () {
        pause();
        curOffset = 0;
        updateUI();
      });

      // ── Controls ──
      btnPlay.addEventListener('click', function () {
        if (isPlaying) { pause(); } else { play(); }
      });

      // Progress scrubbing
      function seek(clientX) {
        var rect = progress.getBoundingClientRect();
        var pct  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        var t    = pct * total;
        curOffset = t;
        if (isPlaying) {
          startWall = Date.now();
          replayer.play(t);
        } else {
          replayer.pause(t);
        }
        updateUI();
      }

      var dragging = false;
      progress.addEventListener('mousedown', function (e) {
        dragging = true;
        seek(e.clientX);
        if (!isPlaying) raf = requestAnimationFrame(tick); // ensure RAF runs while paused+dragging
      });
      document.addEventListener('mousemove', function (e) {
        if (dragging) pendingSeekX = e.clientX; // batched; drained in tick()
      });
      document.addEventListener('mouseup', function () { dragging = false; pendingSeekX = null; });

      // Speed
      document.querySelectorAll('.s-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          document.querySelectorAll('.s-btn').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          speed = parseFloat(btn.getAttribute('data-s') || '1');
          replayer.setConfig({ speed: speed });
          if (isPlaying) {
            curOffset = getCur();
            startWall = Date.now();
            replayer.play(curOffset);
          }
        });
      });

      // Skip inactive toggle
      skipWrap.addEventListener('click', function () {
        skipInactive = !skipInactive;
        skipWrap.className = skipInactive ? 'on' : '';
        replayer.setConfig({ skipInactive: skipInactive });
      });
    }
  })();
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
