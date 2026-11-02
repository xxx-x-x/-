(() => {
  'use strict';

  const api = globalThis.wx || globalThis.tt || null;
  const platform = globalThis.wx ? 'wechat' : globalThis.tt ? 'douyin' : 'web';
  const listeners = { hide: new Set(), show: new Set() };
  const storageKey = 'trash-fashion-best-value';

  function emit(type) {
    for (const callback of listeners[type]) callback();
  }

  if (api?.onHide) api.onHide(() => emit('hide'));
  if (api?.onShow) api.onShow(() => emit('show'));
  if (!api && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => emit(document.hidden ? 'hide' : 'show'));
  }

  globalThis.GamePlatform = {
    name: platform,
    isMiniGame: !!api,
    onHide(callback) { listeners.hide.add(callback); },
    onShow(callback) { listeners.show.add(callback); },
    vibrate(kind = 'short') {
      try {
        if (kind === 'long' && api?.vibrateLong) api.vibrateLong();
        else if (api?.vibrateShort) api.vibrateShort({ type: kind === 'heavy' ? 'heavy' : 'light' });
        else if (navigator?.vibrate) navigator.vibrate(kind === 'long' ? 80 : 24);
      } catch (_) {}
    },
    getBestValue() {
      try {
        const value = api?.getStorageSync ? api.getStorageSync(storageKey) : localStorage.getItem(storageKey);
        return Number(value) || 0;
      } catch (_) { return 0; }
    },
    saveBestValue(value) {
      const best = Math.max(value, this.getBestValue());
      try {
        if (api?.setStorageSync) api.setStorageSync(storageKey, best);
        else localStorage.setItem(storageKey, String(best));
      } catch (_) {}
      return best;
    }
  };
})();
