/* Keep the first paint consistent with the VMTools showcase preference. */
(function(){let theme='dark';try{theme=localStorage.getItem('vmtools-promo-theme')==='light'?'light':'dark';}catch{}
 document.documentElement.dataset.vmTheme=theme;
 document.documentElement.style.colorScheme=theme;
 document.documentElement.style.setProperty('--vm-boot-bg',theme==='light'?'#fff':'#0c1117');
})();
