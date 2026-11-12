window.dockManager = (() => {
    const slots = { left: null, right: null, bottom: null };
    const handlers = {};
    const widths = { tables: 460, calc: 460, stats: 460 };
    let bottomHeight = 320;

    function sideSpace() {
        const viewport = document.documentElement.clientWidth;
        const center = slots.bottom ? Math.min(320, viewport * 0.55) : Math.min(160, viewport * 0.3);
        return Math.max(0, viewport - center);
    }

    function sync() {
        const available = sideSpace();
        let left = slots.left ? widths[slots.left] : 0;
        let right = slots.right ? widths[slots.right] : 0;
        if (left + right > available) {
            const ratio = available / (left + right);
            left *= ratio;
            right *= ratio;
        }
        const root = document.documentElement.style;
        root.setProperty('--left-dock-w', `${left}px`);
        root.setProperty('--right-dock-w', `${right}px`);
        root.setProperty('--bottom-dock-h', slots.bottom ? `${Math.min(bottomHeight, window.innerHeight * 0.85)}px` : '0px');
        window.dispatchEvent(new Event('dock-layout-change'));
    }

    function release(name) {
        for (const side of Object.keys(slots)) {
            if (slots[side] === name) slots[side] = null;
        }
    }

    function set(name, mode) {
        release(name);
        if (mode !== 'float') {
            const occupant = slots[mode];
            if (occupant) {
                const opposite = mode === 'left' ? 'right' : 'left';
                const fallback = !slots[opposite] ? opposite : occupant === 'calc' && !slots.bottom ? 'bottom' : 'float';
                release(occupant);
                if (fallback !== 'float') slots[fallback] = occupant;
                handlers[occupant](fallback);
            }
            slots[mode] = name;
        }
        handlers[name](mode);
        sync();
    }

    window.addEventListener('resize', sync);
    document.addEventListener('DOMContentLoaded', () => {
        let lastWidth = document.documentElement.clientWidth;
        new ResizeObserver(() => {
            const width = document.documentElement.clientWidth;
            if (width !== lastWidth) {
                lastWidth = width;
                sync();
            }
        }).observe(document.documentElement);
    });
    return {
        slots,
        register(name, apply) { handlers[name] = apply; },
        set,
        release(name) { release(name); sync(); },
        resize(name, dimension) {
            const side = Object.keys(slots).find(key => slots[key] === name);
            if (!side) return;
            if (side === 'bottom') bottomHeight = Math.min(window.innerHeight * 0.85, Math.max(320, dimension));
            else {
                const opposite = side === 'left' ? 'right' : 'left';
                const other = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(`--${opposite}-dock-w`)) || 0;
                if (slots[opposite]) widths[slots[opposite]] = other;
                const max = Math.max(0, sideSpace() - other);
                widths[name] = Math.max(Math.min(200, max), Math.min(max, dimension));
            }
            sync();
        }
    };
})();
