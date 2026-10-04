(() => {
  const set=(selector,name,label)=>{const el=document.querySelector(selector);if(el)el.innerHTML=(label?label+' ':'')+VMIcons.icon(name)};
  set('#help-button','help','Cách chơi');set('#expand-figure','expand');set('#reset-button','replay','Làm lại');set('#close-dialog','close');set('#solution-button','arrow','Xem lời giải hoàn chỉnh');
})();
