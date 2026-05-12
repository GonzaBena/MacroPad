window.addEventListener('DOMContentLoaded', async () => {
    const versionEl = document.getElementById('app-version');
    if (versionEl) {
        const version = await window.arduino.getAppVersion();
        versionEl.innerText = version;
    }

    const close = () => window.arduino.close();

    document.getElementById('btn-close-top')?.addEventListener('click', close);
    document.getElementById('btn-close-bottom')?.addEventListener('click', close);
});
