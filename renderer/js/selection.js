const selection = document.getElementById('selection');
let startX, startY, isDragging = false;

window.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    selection.style.display = 'block';
    selection.style.left = startX + 'px';
    selection.style.top = startY + 'px';
    selection.style.width = '0px';
    selection.style.height = '0px';
});

window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const currentX = e.clientX;
    const currentY = e.clientY;

    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    selection.style.left = left + 'px';
    selection.style.top = top + 'px';
    selection.style.width = width + 'px';
    selection.style.height = height + 'px';
});

window.addEventListener('mouseup', e => {
    if (!isDragging) return;
    isDragging = false;

    const rect = selection.getBoundingClientRect();
    if (rect.width > 5 && rect.height > 5) {
        window.selectionApi.finishSelection({
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
        });
    }
});

window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        window.selectionApi.cancelSelection();
    }
});
