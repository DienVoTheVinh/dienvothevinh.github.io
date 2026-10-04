(() => {
  'use strict';
  const paths={
    world:'M3 10 12 3l9 7v11H3Z M8 21v-8h8v8 M9 7h6',
    council:'M12 3 3 8l9 5 9-5-9-5Z M3 12l9 5 9-5 M3 16l9 5 9-5',
    build:'M3 20h18 M5 20V10h14v10 M3 10l9-7 9 7 M9 14v6 M15 14v6',
    compass:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z M15.5 8.5l-2 5-5 2 2-5 5-2Z',
    proof:'M3 20 11 4l10 16H3Z M7 12h9 M11 4l3 16',
    sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5 19 19 M5 19l1.5-1.5 M17.5 6.5 19 5',
    moon:'M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z M16 3v4 M14 5h4',
    play:'M9 5v14l10-7L9 5Z',pause:'M8 5v14 M16 5v14',
    settings:'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
    close:'M6 6l12 12 M18 6 6 18',arrow:'M4 12h16 M14 6l6 6-6 6',back:'M20 12H4 M10 6l-6 6 6 6',
    down:'M6 9l6 6 6-6',replay:'M4 10a8 8 0 1 1 1 7 M4 4v6h6',
    library:'M3 5c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2V5Z M12 7v15 M6 9l3 1 M15 10l3-1',
    bridge:'M2 19h20 M4 19V7 M20 19V7 M4 10c4 7 12 7 16 0 M8 14v5 M12 16v3 M16 14v5',
    observatory:'M4 20h16 M7 20v-7h10v7 M5 13h14a7 7 0 0 0-14 0Z M12 3v3 M19 3v4 M17 5h4',
    workshop:'M4 20h16V10H4v10Z M8 10V5h8v5 M3 15h18 M10 13v4h4v-4',
    scholar:'M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z M3 21v-3a6 6 0 0 1 6-6h6a6 6 0 0 1 6 6v3 M8 16l4 3 4-3',
    spark:'M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z',
    expand:'M9 3H3v6 M15 3h6v6 M21 15v6h-6 M3 15v6h6',
    help:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3 M12 17h.01',
    check:'M5 12l4 4L19 6',leaf:'M20 4C8 2 2 10 7 17s15 0 13-13Z M5 21 16 10'
  };
  function icon(name){return `<svg class="vm-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${paths[name]||paths.spark}"/></svg>`;}
  function hydrate(root=document){root.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}
  window.VMIcons={icon,hydrate};hydrate();
})();
