// Keeps a deck and its phone page on the same slide through this site's own server (/api/slide).
// Opened from a file, there is no server and each page moves on its own.
window.RelaySync = function (onSlide, onStatus) {
  var enabled = /^https?:$/.test(location.protocol);
  // One move in flight at a time, so the server receives this page's moves in order; newer moves replace queued ones.
  var inflight = false, queued = null, seen = 0, latest = null;
  onStatus = onStatus || function () {};

  function busy() { return inflight || queued !== null; }
  function apply(state) {
    if (!state || state.seq < seen) return;
    seen = state.seq;
    onSlide(state.slide);
  }
  function receive(state) {
    if (!latest || state.seq >= latest.seq) latest = state;
    if (!busy()) apply(latest);
  }
  function refresh() {
    if (busy()) return;
    fetch('/api/slide', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (state) {
      onStatus(true);
      if (state.seq > seen) receive(state);
    }, function () { onStatus(false); });
  }

  function flush() {
    var slide = queued;
    queued = null;
    inflight = true;
    fetch('/api/slide', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slide: slide })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (state) {
      seen = Math.max(seen, state.seq);
      onStatus(true);
    }, function () {
      onStatus(false);
      if (queued === null) queued = slide;
      return new Promise(function (r) { setTimeout(r, 1000); });
    }).then(function () {
      inflight = false;
      if (queued !== null) flush();
      else if (latest && latest.seq > seen) apply(latest);
    });
  }

  if (enabled) {
    if (window.EventSource) {
      var events = new EventSource('/api/slide/events');
      events.onopen = function () { onStatus(true); };
      events.onerror = function () { onStatus(false); };
      events.onmessage = function (e) { try { receive(JSON.parse(e.data)); } catch (err) {} };
    }
    // Backup for networks that hold the event stream back, and for a phone waking from sleep.
    setInterval(refresh, 4000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refresh(); });
  }

  return {
    enabled: enabled,
    publish: function (slide) {
      if (!enabled) return;
      queued = slide;
      if (!inflight) flush();
    }
  };
};
