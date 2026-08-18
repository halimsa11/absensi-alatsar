// Toast Notification Utility untuk Sistem Absensi Siswa
function showToast(message, type = 'success', duration = 3500) {
  let toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    toastContainer.className = 'fixed top-5 right-5 z-[99999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const isDelete = type === 'delete';
  const isSuccess = type === 'success';
  const isError = type === 'error';
  const isInfo = type === 'info';

  let bgColor = 'bg-slate-900/95 border-slate-700 text-white';
  let iconName = 'info';
  let iconColor = 'text-emerald-400';
  let closeBtnColor = 'text-white/60 hover:text-white';

  if (isDelete) {
    bgColor = 'bg-rose-50/95 border-rose-200 text-rose-800 shadow-lg';
    iconName = 'trash-2';
    iconColor = 'text-rose-600';
    closeBtnColor = 'text-rose-400 hover:text-rose-700';
  } else if (isSuccess) {
    bgColor = 'bg-emerald-900/95 border-emerald-700 text-white';
    iconName = 'check-circle';
    iconColor = 'text-emerald-400';
    closeBtnColor = 'text-white/60 hover:text-white';
  } else if (isError) {
    bgColor = 'bg-rose-900/95 border-rose-700 text-white';
    iconName = 'alert-circle';
    iconColor = 'text-rose-400';
    closeBtnColor = 'text-white/60 hover:text-white';
  }

  toast.className = `pointer-events-auto flex items-center gap-3 p-4 rounded-2xl shadow-xl border ${bgColor} text-sm font-medium transition-all duration-300 transform translate-y-[-15px] opacity-0 backdrop-blur-sm`;
  toast.innerHTML = `
    <i data-lucide="${iconName}" class="w-5 h-5 flex-shrink-0 ${iconColor}"></i>
    <div class="flex-1 text-xs sm:text-sm font-semibold leading-relaxed">${message}</div>
    <button onclick="this.parentElement.remove()" class="${closeBtnColor} transition text-xs ml-1 focus:outline-none font-bold">✕</button>
  `;

  toastContainer.appendChild(toast);
  if (window.lucide) {
    lucide.createIcons();
  }

  // Animasi Masuk
  setTimeout(() => {
    toast.classList.remove('translate-y-[-15px]', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
  }, 10);

  // Otomatis Hilang
  setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-[-15px]', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Cek Flash Message dari Halaman Sebelumnya atau Tampilkan Notif Masuk Halaman
function checkFlashToast(defaultEntranceMessage = null) {
  try {
    const flash = sessionStorage.getItem('flashToast');
    if (flash) {
      sessionStorage.removeItem('flashToast');
      const parsed = JSON.parse(flash);
      setTimeout(() => showToast(parsed.message, parsed.type || 'success'), 150);
      return;
    }
  } catch (e) {}

  if (defaultEntranceMessage) {
    setTimeout(() => showToast(defaultEntranceMessage, 'info'), 200);
  }
}
