// APP_NAME — entry point

document.addEventListener('DOMContentLoaded', () => {
  const main = document.getElementById('main');
  App.init(main);
});

const App = {
  init(root) {
    root.innerHTML = `
      <div class="card">
        <h2 style="font-size:16px;font-weight:700;margin-bottom:8px;">欢迎使用 APP_NAME</h2>
        <p style="color:#64748b;">在这里开始构建你的应用。</p>
      </div>
    `;
    // Add your app logic here
  }
};
