(function () {
  var mode = 'light';

  try {
    var savedMode = localStorage.getItem('diary-theme');
    if (savedMode === 'dark' || savedMode === 'paper') {
      mode = savedMode;
    }
  } catch (error) {
    /* 无法读取 localStorage 时继续按默认浅色主题渲染 */
  }

  try {
    var background = mode === 'dark' ? '#111827' : mode === 'paper' ? '#f3eee2' : '#f9fafb';
    var root = document.documentElement;
    root.classList.add('theme-' + mode);
    root.style.backgroundColor = background;
    root.style.colorScheme = mode === 'dark' ? 'dark' : 'light';
    var themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', background);
    }
  } catch (error) {
    /* 首屏主题初始化失败时交给 React 挂载后的主题逻辑处理 */
  }
})();
