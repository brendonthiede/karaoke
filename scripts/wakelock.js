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