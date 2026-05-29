// Loading screen management — Desktop (Tauri) vs Browser mode
(function () {
  var _lo = document.getElementById("__loading__");
  if (!_lo) {return;}

  var _removed = false;
  var _isDesktop = window.location.hostname === "tauri.localhost";
  var _startTime = Date.now();
  var _ob = null;
  var _statusTimer = 0;

  function _fadeOutLoading() {
    if (_removed) {return;}
    _removed = true;
    _lo.style.transition = "opacity 0.3s";
    _lo.style.opacity = "0";
    setTimeout(function () {
      _lo.remove();
    }, 300);
    if (_ob) {_ob.disconnect();}
    clearInterval(_pi);
    clearInterval(_statusTimer);
  }

  if (_isDesktop) {
    // Desktop mode (CN): Rust poll_and_navigate handles gateway health polling
    // and redirects the WebView to the gateway HTTP URL when ready.
    // This loading screen just shows status messages while waiting.
    // We do NOT redirect from JS (Rust handles it) to avoid race conditions.

    // If hash already has token from Rust injection, the redirect is imminent
    // or the page is about to navigate — just wait.

    // Status messages based on elapsed time
    _statusTimer = setInterval(function () {
      var elapsed = Date.now() - _startTime;
      var txt = document.getElementById("__loading_text__");
      var sub = document.getElementById("__loading_sub__");
      if (!txt) {return;}
      if (elapsed > 45000) {
        txt.textContent =
          "\u542F\u52A8\u65F6\u95F4\u8F83\u957F\uFF0C\u5982\u957F\u65F6\u95F4\u65E0\u54CD\u5E94\u8BF7\u91CD\u542F\u5E94\u7528";
        txt.style.color = "#f87171";
        if (sub)
          {sub.textContent = "\u53EF\u80FD\u662F\u6740\u6BD2\u8F6F\u4EF6\u62E6\u622A\u4E86 node.exe";}
      } else if (elapsed > 20000) {
        txt.textContent = "\u670D\u52A1\u542F\u52A8\u4E2D\uFF0C\u8BF7\u8010\u5FC3\u7B49\u5F85...";
        txt.style.color = "#fbbf24";
      } else if (elapsed > 8000) {
        txt.textContent = "\u6B63\u5728\u521D\u59CB\u5316\u540E\u53F0\u670D\u52A1...";
      }
    }, 2000);

    // Timeout: force remove loading after 90s
    setTimeout(function () {
      if (!_removed) {_fadeOutLoading();}
    }, 90000);
  } else {
    // Browser mode: wait for app component to render, then fade out loading
    function _tryRemove() {
      if (_removed) {return;}
      var app = document.querySelector("openclaw-cn-app");
      if (!app) {return;}
      var hasContent =
        (app.shadowRoot && app.shadowRoot.children.length > 0) || app.children.length > 0;
      if (hasContent) {_fadeOutLoading();}
    }
    _ob = new MutationObserver(_tryRemove);
    _ob.observe(document.body, { childList: true, subtree: true });
    // Fallback: force remove loading after 10 seconds
    setTimeout(function () {
      if (!_removed && _lo.parentNode) {_fadeOutLoading();}
    }, 10000);
  }
  var _pi = setInterval(function () {
    if (!_isDesktop) {
      var app = document.querySelector("openclaw-cn-app");
      if (app) {
        var c = (app.shadowRoot && app.shadowRoot.children.length > 0) || app.children.length > 0;
        if (c) {_fadeOutLoading();}
      }
    }
  }, 100);
})();
