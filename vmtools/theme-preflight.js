/* Resolve the saved app theme before modules, fonts or account checks load. */
(function(){
 let mode='dark';try{mode=localStorage.getItem('vmtools-theme-mode')||'dark';}catch{}
 const theme=mode==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):mode==='light'?'light':'dark';
 document.documentElement.dataset.theme=theme;
 document.documentElement.style.colorScheme=theme;
 document.documentElement.style.setProperty('--vm-boot-bg',theme==='light'?'#ffffff':'#0d1117');
})();
