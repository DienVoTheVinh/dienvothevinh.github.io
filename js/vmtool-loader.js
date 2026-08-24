(function () {
  'use strict';

  var modules = {
    plane: { src: 'js/vmtool-plane.js?v=3', ready: false, loading: null },
    spatial: { src: 'js/vmtool-3d.js?v=5', ready: false, loading: null }
  };

  function setLoading(name, loading) {
    var tab = document.querySelector('[data-vmtool-tab="' + name + '"]');
    if (!tab) return;
    tab.classList.toggle('is-loading', loading);
    tab.setAttribute('aria-busy', String(loading));
  }

  function loadModule(name) {
    var module = modules[name];
    if (!module || module.ready) return Promise.resolve();
    if (module.loading) return module.loading;
    setLoading(name, true);
    module.loading = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = module.src;
      script.async = true;
      script.onload = function () { module.ready = true; setLoading(name, false); resolve(); };
      script.onerror = function () { setLoading(name, false); module.loading = null; reject(new Error('Không tải được công cụ. Vui lòng thử lại.')); };
      document.body.appendChild(script);
    });
    return module.loading;
  }

  function updateMode(name) {
    var mode = document.getElementById('vmtoolModeName');
    var meta = document.getElementById('vmtoolModeMeta');
    if (!mode || !meta) return;
    if (name === 'plane') { mode.textContent = 'Hình phẳng động'; meta.textContent = 'Dựng hình · TikZ · PDF'; }
    else if (name === 'spatial') { mode.textContent = 'Hình không gian 3D'; meta.textContent = 'Xoay hình · Giao tuyến · PNG'; }
    else { mode.textContent = 'Miền nghiệm 2D'; meta.textContent = 'Đồ thị · PNG · TikZ'; }
  }

  async function showTab(name) {
    document.querySelectorAll('[data-vmtool-panel]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-vmtool-panel') !== name;
    });
    document.querySelectorAll('[data-vmtool-tab]').forEach(function (tab) {
      var active = tab.getAttribute('data-vmtool-tab') === name;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    updateMode(name);
    if (modules[name]) {
      try { await loadModule(name); }
      catch (error) {
        var toast = document.getElementById('vmtoolToast');
        if (toast) { toast.textContent = error.message; toast.classList.add('show'); }
      }
    }
    document.dispatchEvent(new CustomEvent('vmtool:tab', { detail: { name: name } }));
  }

  function init() {
    document.querySelectorAll('[data-vmtool-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () { showTab(tab.getAttribute('data-vmtool-tab')); });
    });
    window.VMToolModules = { load: loadModule, show: showTab, state: modules };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
