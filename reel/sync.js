// Keeps a deck and its phone page on the same slide through this site's own server (/api/slide).
// Opened from a file, there is no server and each page moves on its own.
window.RelaySync = function (onSlide, onStatus) {
  var enabled = /^https?:$/.test(location.protocol);
  var pending = 0, seen = 0, latest = null;
  onStatus = onStatus || function () {};

  function apply(state) {
    if (!state || state.seq < seen) return;
    seen = state.seq;
    onSlide(state.slide);
  }
  function receive(state) {
    latest = state;
    if (!pending) apply(state);
  }

  if (enabled) {
    if (window.EventSource) {
      var events = new EventSource('/api/slide/events');
      events.onopen = function () { onStatus(true); };
      events.onerror = function () { onStatus(false); };
      events.onmessage = function (e) { try { receive(JSON.parse(e.data)); } catch (err) {} };
    }
    // Backup for networks that hold the event stream back.
    setInterval(function () {
      if (pending) return;
      fetch('/api/slide', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (state) {
        onStatus(true);
        if (state.seq > seen) receive(state);
      }, function () { onStatus(false); });
    }, 4000);
  }

  return {
    enabled: enabled,
    publish: function (slide) {
      if (!enabled) return;
      pending++;
      fetch('/api/slide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slide: slide })
      }).then(function (r) { return r.json(); }).then(function (state) {
        seen = Math.max(seen, state.seq);
        onStatus(true);
      }, function () { onStatus(false); }).then(function () {
        pending--;
        if (!pending && latest && latest.seq > seen) apply(latest);
      });
    }
  };
};
