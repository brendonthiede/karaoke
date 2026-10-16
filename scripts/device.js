// Loaded by every page. Keeps the device usable for a whole set: the screen stays
// awake, and the site keeps working if Wi-Fi drops (sw.js).

// --- Screen wake lock ---
let wakeLock = null;

function isScreenLockSupported() {
    return 'wakeLock' in navigator && 'request' in navigator.wakeLock;
}

const requestWakeLock = async () => {
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        console.log('Screen wake lock is active');
    } catch (err) {
        console.error(`Failed to acquire wake lock: ${err}`);
    }
};

const handleVisibilityChange = async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
    }
};

if (isScreenLockSupported()) {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    requestWakeLock();
} else {
    console.log('Screen wake lock is not supported');
}

// --- Offline (service worker) ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(new URL('../sw.js', document.currentScript.src));
}
