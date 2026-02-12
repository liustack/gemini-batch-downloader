(function () {
  'use strict';

  var _fetch = window.fetch;

  // Listen for control messages from content script via postMessage
  // (CustomEvent.detail cannot cross isolated world → main world boundary)
  window.addEventListener('message', function (e) {
    if (e.source === window && e.data && e.data.type === 'GBD_SUPPRESS') {
      window.__gbd_suppressDownload = !!e.data.suppress;
    }
  });

  // Patch fetch to intercept final image responses from Gemini download chain
  // Redirect chain: gg-dl/ -> (text) -> rd-gg-dl/ -> (text) -> rd-gg-dl/ -> image/png
  window.fetch = async function () {
    var args = arguments;
    var response = await _fetch.apply(this, args);
    var url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);

    if (url && (url.indexOf('/rd-gg-dl/') !== -1 || url.indexOf('/gg-dl/') !== -1)) {
      var contentType = response.headers.get('content-type') || '';
      if (contentType.indexOf('image/') === 0) {
        // Final image in the redirect chain — convert to data URL and post to content script
        var cloned = response.clone();
        cloned.blob().then(function (blob) {
          var reader = new FileReader();
          reader.onload = function () {
            window.postMessage({
              type: 'GBD_IMAGE_CAPTURED',
              dataUrl: reader.result,
              size: blob.size
            }, '*');
          };
          reader.readAsDataURL(blob);
        });
      }
    }

    return response;
  };

  // Suppress native blob downloads when our extension is actively downloading
  var _click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (window.__gbd_suppressDownload && this.download && this.href && this.href.indexOf('blob:') === 0) {
      try { URL.revokeObjectURL(this.href); } catch (e) { /* ignore */ }
      return;
    }
    return _click.call(this);
  };
})();
