// Toast Notification Utility untuk Sistem Absensi Siswa (Mobile-Optimized & Clean UI)
function showToast(message, type = 'success', duration = 3200) {
  let toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    // Di mobile: Berada di atas tengah layar, proporsional, tidak menutupi seluruh layar
    // Di desktop: Berada di pojok kanan atas
    toastContainer.className = 'fixed top-3 sm:top-5 left-1/2 -translate-x-1/2 sm:left-auto sm:right-5 sm:translate-x-0 z-[99999] flex flex-col gap-2 sm:gap-2.5 w-[calc(100%-1.5rem)] sm:w-auto sm:max-w-sm pointer-events-none items-center sm:items-end';
    document.body.appendChild(toastContainer);
  }

  // Batasi maksimal 3 notifikasi bertumpuk agar tidak memenuhi layar HP
  while (toastContainer.children.length >= 3) {
    const oldest = toastContainer.firstElementChild;
    if (oldest) oldest.remove();
  }

  const toast = document.createElement('div');
  const isDelete = type === 'delete';
  const isSuccess = type === 'success';
  const isError = type === 'error';
  const isWarning = type === 'warning';
  const isInfo = type === 'info';

  let bgColor = 'bg-slate-900/95 border-slate-700/80 text-slate-100';
  let iconName = 'info';
  let iconColor = 'text-sky-400';
  let closeBtnColor = 'text-slate-400 hover:text-white hover:bg-slate-800';

  if (isDelete) {
    bgColor = 'bg-rose-950/95 border-rose-700/80 text-rose-100';
    iconName = 'trash-2';
    iconColor = 'text-rose-400';
    closeBtnColor = 'text-rose-300 hover:text-white hover:bg-rose-900';
  } else if (isSuccess) {
    bgColor = 'bg-emerald-950/95 border-emerald-700/80 text-emerald-100';
    iconName = 'check-circle-2';
    iconColor = 'text-emerald-400';
    closeBtnColor = 'text-emerald-300 hover:text-white hover:bg-emerald-900';
  } else if (isError) {
    bgColor = 'bg-rose-950/95 border-rose-700/80 text-rose-100';
    iconName = 'alert-circle';
    iconColor = 'text-rose-400';
    closeBtnColor = 'text-rose-300 hover:text-white hover:bg-rose-900';
  } else if (isWarning) {
    bgColor = 'bg-amber-950/95 border-amber-700/80 text-amber-100';
    iconName = 'alert-triangle';
    iconColor = 'text-amber-400';
    closeBtnColor = 'text-amber-300 hover:text-white hover:bg-amber-900';
  }

  // Tampilan ringkas, kompak & rapi di layar mobile (padding kecil & proporsional)
  toast.className = `pointer-events-auto w-full sm:w-auto min-w-[280px] sm:min-w-[320px] max-w-full flex items-center gap-2.5 px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-xl sm:rounded-2xl shadow-lg shadow-black/20 border ${bgColor} text-xs sm:text-sm font-medium transition-all duration-300 transform -translate-y-3 opacity-0 backdrop-blur-md select-none cursor-pointer`;
  
  toast.innerHTML = `
    <div class="flex-shrink-0 flex items-center justify-center">
      <i data-lucide="${iconName}" class="w-4 h-4 sm:w-5 sm:h-5 ${iconColor}"></i>
    </div>
    <div class="flex-1 text-[11px] sm:text-xs font-semibold leading-tight pr-1 break-words">${message}</div>
    <button type="button" aria-label="Tutup" class="flex-shrink-0 ${closeBtnColor} p-1 rounded-lg transition-colors flex items-center justify-center focus:outline-none">
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  `;

  // Tutup jika diklik
  const closeBtn = toast.querySelector('button');
  const dismissToast = (e) => {
    if (e) e.stopPropagation();
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('-translate-y-3', 'opacity-0');
    setTimeout(() => toast.remove(), 250);
  };

  closeBtn.addEventListener('click', dismissToast);
  toast.addEventListener('click', dismissToast);

  toastContainer.appendChild(toast);
  if (window.lucide) {
    lucide.createIcons();
  }

  // Animasi Masuk yang Halus
  requestAnimationFrame(() => {
    setTimeout(() => {
      toast.classList.remove('-translate-y-3', 'opacity-0');
      toast.classList.add('translate-y-0', 'opacity-100');
    }, 20);
  });

  // Otomatis Hilang
  const timer = setTimeout(() => {
    dismissToast();
  }, duration);

  // Jika disentuh/hover, tunda penghapusan
  toast.addEventListener('mouseenter', () => clearTimeout(timer));
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
    setTimeout(() => showToast(defaultEntranceMessage, 'info', 2800), 200);
  }
}
