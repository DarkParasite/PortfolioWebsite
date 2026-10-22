// Game tier list: shared helpers, and <tier-list> which renders the public page at /tiers/.
// The data is /data/tiers.json. Don't edit it by hand, use the editor at /tiers/edit/
// (it saves through the Cloudflare Worker in /worker, see worker/README.md).

const TIER_COLORS = ['#ff7f7f', '#ffbf7f', '#ffdf7f', '#ffff7f', '#bfff7f', '#7fff7f', '#7fffff', '#7fbfff', '#bf7fff', '#ff7fdf', '#a1a1aa'];

const Tiers = {
    esc(text) {
        return String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    // Black or white text, whichever reads better on the tier color.
    textOn(hex) {
        const n = parseInt(hex.slice(1), 16);
        const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255];
        return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? '#000' : '#fff';
    },

    labelStyle(tier) {
        return `background:${tier.color};color:${Tiers.textOn(tier.color)}`;
    },

    labelInner(tier) {
        const long = [...tier.label].length > 3;   // words like "Peak" get a smaller font than "S"
        return `<span class="tier-letter${long ? ' tier-letter-long' : ''}">${Tiers.esc(tier.label)}</span>`
            + (tier.caption ? `<span class="tier-caption">${Tiers.esc(tier.caption)}</span>` : '');
    },

    // Inside of a .cover. `src` overrides game.cover (the editor uses it for covers that aren't uploaded yet).
    // large: full-size image, for popups. label: name overlay on hover.
    coverInner(game, src = game.cover, { large = false, label = !large } = {}) {
        const name = Tiers.esc(game.name);
        let img = '';
        if (src) {
            // IGDB covers are stored at t_cover_big (264x374); ask for the 2x file on sharp screens and in big views.
            const igdb2x = src.includes('/t_cover_big/') ? src.replace('/t_cover_big/', '/t_cover_big_2x/') : null;
            const attrs = igdb2x && large ? `src="${Tiers.esc(igdb2x)}"`
                : `src="${Tiers.esc(src)}"${igdb2x ? ` srcset="${Tiers.esc(src)} 1x, ${Tiers.esc(igdb2x)} 2x"` : ''}`;
            img = `<img ${attrs} alt="${name}"${large ? '' : ' loading="lazy"'} draggable="false" onerror="this.remove()">`;
        }
        return `<span class="cover-fallback">${name}</span>${img}${label ? `<span class="cover-name">${name}</span>` : ''}`;
    },

    gameCount(data) {
        return data.tiers.reduce((sum, t) => sum + t.games.length, 0);
    },

    formatDate(iso) {
        return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    },
};

// ---- <tier-list>: the public tier list ----
class TierList extends HTMLElement {
    async connectedCallback() {
        this.innerHTML = `<div class="tier-board h-96 animate-pulse"></div>`;
        try {
            const res = await fetch('/data/tiers.json', { cache: 'no-cache' });
            if (!res.ok) throw new Error(res.status);
            this.data = await res.json();
        } catch {
            this.innerHTML = `<div class="panel p-6 font-mono text-sm text-gray-500">// couldn't load the tier list, try refreshing</div>`;
            return;
        }
        this.render();
    }

    render() {
        const { data } = this;
        // Flat list in board order, so the popup can step through games with prev / next.
        this.games = data.tiers.flatMap(tier => tier.games.map(game => ({ game, tier })));
        let i = 0;

        const rows = data.tiers.map(tier => `
            <section class="tier-row" aria-label="${Tiers.esc(tier.label)} tier">
                <div class="tier-label" style="${Tiers.labelStyle(tier)}">${Tiers.labelInner(tier)}</div>
                <div class="tier-items">
                    ${tier.games.map(game => `<button type="button" class="cover" data-index="${i++}" title="${Tiers.esc(game.name)}">${Tiers.coverInner(game)}</button>`).join('')}
                </div>
            </section>`).join('');

        const count = Tiers.gameCount(data);
        this.innerHTML = `
            <section class="panel p-6 md:p-8">
                <p class="font-mono text-sm text-gray-400 mb-1">$ cat games.tier</p>
                <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h1 class="text-2xl font-bold">${Tiers.esc(data.title || 'Game Tier List')}</h1>
                    <p class="font-mono text-sm text-gray-500">${count} game${count === 1 ? '' : 's'}${data.updated ? ` · updated ${Tiers.formatDate(data.updated)}` : ''}</p>
                </div>
                ${data.intro ? `<p class="mt-3 leading-relaxed text-gray-700 whitespace-pre-line">${Tiers.esc(data.intro)}</p>` : ''}
            </section>

            <div class="tier-board mt-6">${rows}</div>
            ${count ? `<p class="font-mono text-xs text-gray-500 mt-3">// click a cover for details</p>` : ''}

            <dialog class="modal"></dialog>`;

        this.dialog = this.querySelector('dialog');
        this.querySelector('.tier-board').addEventListener('click', e => {
            const cover = e.target.closest('[data-index]');
            if (cover) this.open(Number(cover.dataset.index));
        });
        this.dialog.addEventListener('click', e => {
            if (e.target === this.dialog) this.dialog.close();           // backdrop
            const step = e.target.closest('[data-step]');
            if (step) this.open(this.current + Number(step.dataset.step));
            if (e.target.closest('[data-close]')) this.dialog.close();
        });
        this.dialog.addEventListener('keydown', e => {
            if (e.key === 'ArrowLeft') this.open(this.current - 1);
            if (e.key === 'ArrowRight') this.open(this.current + 1);
        });
    }

    open(index) {
        const total = this.games.length;
        this.current = (index + total) % total;
        const { game, tier } = this.games[this.current];

        this.dialog.innerHTML = `
            <div class="flex flex-col sm:flex-row">
                <div class="cover w-40 mx-auto mt-6 shadow-lg sm:w-56 sm:m-0 sm:rounded-none sm:shadow-none">${Tiers.coverInner(game, game.cover, { large: true })}</div>
                <div class="flex flex-col flex-1 min-w-0 p-5">
                    <div class="flex items-start justify-between gap-3">
                        <span class="tier-badge" style="${Tiers.labelStyle(tier)}">${Tiers.esc(tier.label)} tier${tier.caption ? ` · ${Tiers.esc(tier.caption)}` : ''}</span>
                        <button type="button" data-close class="text-gray-400 hover:text-gray-900 -mt-1" aria-label="Close"><i class="fa-solid fa-xmark text-lg"></i></button>
                    </div>
                    <h2 class="text-xl font-bold mt-3">${Tiers.esc(game.name)}</h2>
                    ${game.year ? `<p class="font-mono text-sm text-gray-500">${game.year}</p>` : ''}
                    ${game.note
                        ? `<p class="mt-4 leading-relaxed text-gray-700 whitespace-pre-line">${Tiers.esc(game.note)}</p>`
                        : `<p class="mt-4 font-mono text-sm text-gray-400">// no notes yet</p>`}
                    <div class="flex items-center justify-between mt-auto pt-6 font-mono text-sm">
                        <button type="button" data-step="-1" class="text-gray-500 hover:text-blue-500"><i class="fa-solid fa-arrow-left text-xs"></i> prev</button>
                        <span class="text-xs text-gray-400">${this.current + 1} / ${total}</span>
                        <button type="button" data-step="1" class="text-gray-500 hover:text-blue-500">next <i class="fa-solid fa-arrow-right text-xs"></i></button>
                    </div>
                </div>
            </div>`;
        if (!this.dialog.open) this.dialog.showModal();
    }
}

customElements.define('tier-list', TierList);
