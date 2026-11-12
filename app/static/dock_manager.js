window.dockManager = (() => {
    const slots = { left: [], right: [], bottom: [] };
    const handlers = {};
    const elements = {
        stats: () => document.getElementById('floating-stats-window'),
        tables: () => document.getElementById('floating-tables-window'),
        calc: () => document.getElementById('calc-dock')
    };
    const widths = { tables: 460, calc: 460, stats: 460 };
    let bottomHeight = 330;

    function maxWidth(side) {
        return Math.max(0, ...slots[side].map(name => widths[name]));
    }

    function sideSpace() {
        const viewport = document.documentElement.clientWidth;
        const center = slots.bottom.length
            ? Math.min(320, viewport * 0.55)
            : Math.min(160, viewport * 0.3);
        return Math.max(0, viewport - center);
    }

    function reflow() {
        const available = sideSpace();
        let left = maxWidth('left');
        let right = maxWidth('right');
        if (left + right > available) {
            const ratio = available / (left + right);
            left *= ratio;
            right *= ratio;
        }

        const root = document.documentElement.style;
        root.setProperty('--left-dock-w', `${left}px`);
        root.setProperty('--right-dock-w', `${right}px`);
        let dockHeight = slots.bottom.length
            ? Math.min(bottomHeight, window.innerHeight * 0.85)
            : 0;
        if (slots.bottom.includes('calc')) {
            dockHeight = Math.max(320, Math.min(520, dockHeight));
        }
        root.setProperty('--bottom-dock-h', `${dockHeight}px`);

        for (const side of Object.keys(slots)) {
            const names = slots[side];
            const count = names.length;
            names.forEach((name, index) => {
                const node = elements[name]?.();
                if (!node) return;
                if (side === 'bottom') {
                    const slotWidth = Math.max(
                        0,
                        (window.innerWidth - left - right) / count
                    );
                    node.style.setProperty('--dock-slot-left', `${left + slotWidth * index}px`);
                    node.style.setProperty('--dock-slot-width', `${slotWidth}px`);
                    if (name === 'calc') node.style.setProperty('--calc-dock-h', `${dockHeight}px`);
                } else {
                    const slotHeight = window.innerHeight / count;
                    node.style.setProperty('--dock-slot-top', `${slotHeight * index}px`);
                    node.style.setProperty('--dock-slot-height', `${slotHeight}px`);
                    if (name === 'calc') node.style.removeProperty('--calc-dock-h');
                }
            });
        }

        for (const [name, getElement] of Object.entries(elements)) {
            const node = getElement();
            if (!node) continue;
            if (!Object.values(slots).some(names => names.includes(name))) {
                ['--dock-slot-left', '--dock-slot-width', '--dock-slot-top', '--dock-slot-height', '--calc-dock-h']
                    .forEach(property => node.style.removeProperty(property));
            }
        }
        window.dispatchEvent(new Event('dock-layout-change'));
    }

    function removeFromSlots(name) {
        Object.values(slots).forEach(names => {
            const index = names.indexOf(name);
            if (index !== -1) names.splice(index, 1);
        });
    }

    function set(name, mode) {
        if (!handlers[name]) throw new Error(`Dock tool is not registered: ${name}`);
        if (mode !== 'float' && !Object.hasOwn(slots, mode)) {
            throw new Error(`Unknown dock edge: ${mode}`);
        }
        removeFromSlots(name);
        if (mode !== 'float') slots[mode].push(name);
        handlers[name](mode);
        reflow();
    }

    window.addEventListener('resize', reflow);
    document.addEventListener('DOMContentLoaded', () => {
        let lastWidth = document.documentElement.clientWidth;
        new ResizeObserver(() => {
            const width = document.documentElement.clientWidth;
            if (width !== lastWidth) {
                lastWidth = width;
                reflow();
            }
        }).observe(document.documentElement);
    });

    return {
        slots,
        register(name, apply) { handlers[name] = apply; },
        set,
        reflow,
        release(name) {
            removeFromSlots(name);
            reflow();
        },
        resize(name, dimension) {
            const side = Object.keys(slots).find(key => slots[key].includes(name));
            if (!side) return;
            if (side === 'bottom') {
                bottomHeight = Math.min(window.innerHeight * 0.85, Math.max(320, dimension));
            } else {
                const opposite = side === 'left' ? 'right' : 'left';
                const other = maxWidth(opposite);
                const max = Math.max(200, sideSpace() - other);
                const width = Math.max(200, Math.min(max, dimension));
                slots[side].forEach(tool => { widths[tool] = width; });
            }
            reflow();
        }
    };
})();
