/** Runs in the first HTML so a deck message is kept even before React listens. */
export const PRESENT_LISTENER_SCRIPT = `(function(){
  if(!/[?&]present=1(?:&|$)/.test(location.search)) return;
  var key="__relayDeckQueue";
  window[key]=window[key]||[];
  window.addEventListener("message",function(event){
    var item={origin:event.origin,data:event.data};
    if(window.__relayDeckReady){
      window.dispatchEvent(new CustomEvent("relay-deck",{detail:item}));
    }else{
      window[key].push(item);
    }
  });
})();`;
