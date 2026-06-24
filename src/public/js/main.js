function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('open');
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  sidebar.classList.remove('open');
  overlay.classList.remove('open');
}

function markRead(id, el) {
  fetch('/api/notifications/read/' + id, { method: 'POST' })
    .then(() => {
      const item = el.closest ? el : el;
      if (item) item.classList.remove('unread');
      const count = document.querySelector('.notif-count');
      if (count) {
        const n = parseInt(count.textContent) - 1;
        if (n <= 0) count.remove();
        else count.textContent = n;
      }
    });
}
