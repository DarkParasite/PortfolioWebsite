// Personal projects: the single source of truth.
// The home page grid, the filter chips, and every project page's title block and prev/next links are built from this list.
// To add a project: add an entry here (order = display order) and create its page in /pages/portfolio/.

const PROJECTS = [
    {
        title: 'Battle Royale Game',
        href: '/pages/portfolio/battle_royale.html',
        image: '/assets/images/card_thumbnails/battle-royale-img.jpg',
        summary: 'Made from scratch over span of 5 months with more than 40,000 lines of code.',
        date: 'April 2024 - September 2024',
        tags: ['C++', 'Blueprint', 'Multiplayer', 'Unreal Engine'],
        filters: ['cpp', 'multiplayer'],
    },
    {
        title: '3D Rendering Engine',
        href: '/pages/portfolio/render_engine.html',
        image: '/assets/images/card_thumbnails/render-engine-img.jpg',
        summary: 'Phong Lighting Model implemented using OpenGL, SDL2 and other libraries.',
        date: 'July 2023',
        tags: ['C++', 'GLSL', 'OpenGL', 'SDL2'],
        filters: ['cpp', 'graphics'],
    },
    {
        title: 'FPS Shooter Parkour Game',
        href: '/pages/portfolio/fps_shooter_parkour.html',
        image: '/assets/images/card_thumbnails/fps-game-img.jpg',
        summary: 'First-Person Shooter game with wall running, grappling, AI and other unique abilities.',
        date: '2022',
        tags: ['C++', 'Blueprint', 'AI', 'Unreal Engine'],
        filters: ['cpp', 'ai'],
    },
    {
        title: 'Zombie Shooter Game',
        href: '/pages/portfolio/zombie_shooter.html',
        image: '/assets/images/card_thumbnails/zombie-shooter-img.jpg',
        summary: 'Zombie Shooter game where there are infinite number of waves, with increasing difficulty.',
        date: 'September 2023',
        tags: ['C++', 'Blueprint', 'AI', 'Unreal Engine'],
        filters: ['cpp', 'ai'],
    },
    {
        title: 'Stealth AI',
        href: '/pages/portfolio/stealth_ai.html',
        image: '/assets/images/card_thumbnails/stealth-ai-img.jpg',
        summary: 'AI mechanics like patrolling, detection, searching, taking hostage, melee combat, finding and switching cover etc.',
        date: 'June 2023 - July 2023',
        tags: ['Blueprint', 'AI', 'Unreal Engine'],
        filters: ['ai'],
    },
    {
        title: 'VR Learning Simulations',
        href: '/pages/portfolio/vr-learning-simulations.html',
        image: '/assets/images/card_thumbnails/vr-learning-platform-img.jpg',
        summary: 'Solar System and interactable Human Anatomy simulation in Virtual Reality.',
        date: 'January 2024',
        tags: ['Blueprint', 'VR', 'Unreal Engine'],
        filters: ['vr'],
    },
    {
        title: 'Procedural Hand Grabbing in VR',
        href: '/pages/portfolio/procedural_hand_grabbing_vr.html',
        image: '/assets/images/card_thumbnails/vr-procedural-grab-img.jpg',
        summary: 'Fingers of the VR Hand Mesh snaps to the dynamic shape of the object grabbed.',
        date: 'October 2023',
        tags: ['Blueprint', 'VR', 'Unreal Engine'],
        filters: ['vr'],
    },
    {
        title: 'Co-op Multiplayer Puzzles',
        href: '/pages/portfolio/coop_multiplayer_puzzles.html',
        image: '/assets/images/card_thumbnails/coop-multiplayer-puzzle-img.jpg',
        summary: 'Basic Puzzles implemented using Unreal Engine Replication system.',
        date: 'September 2022',
        tags: ['C++', 'Blueprint', 'Multiplayer', 'Unreal Engine'],
        filters: ['cpp', 'multiplayer'],
    },
    {
        title: 'Exploration Game',
        href: '/pages/portfolio/exploration-game.html',
        image: '/assets/images/card_thumbnails/exploration-game-img.jpg',
        summary: 'Visit Worlds, Fight, Collect, go back to Base, Exchange items for Coins, Buy Weapons, Equipment, REPEAT.',
        date: 'October 2022 - November 2022',
        tags: ['Blueprint', 'Unreal Engine'],
        filters: [],
    },
    {
        title: 'TPP Shooter Game',
        href: '/pages/portfolio/ttp_shooter_game.html',
        image: '/assets/images/card_thumbnails/ttp-shooter-game-img.jpg',
        summary: 'One of the first games I have ever made, implemented Basic Shooter game mechanics.',
        date: 'August 2022 - September 2022',
        tags: ['C++', 'Blueprint', 'Unreal Engine'],
        filters: ['cpp'],
    },
    {
        title: 'Abilities Game',
        href: '/pages/portfolio/abilities-game.html',
        image: '/assets/images/card_thumbnails/abilities-game-img.jpg',
        summary: 'Implemented various abilities using Paragon characters and assets.',
        date: 'September 2021',
        tags: ['C++', 'Blueprint', 'Unreal Engine'],
        filters: ['cpp'],
    },
];

// Filter chips shown above the grid (key must match the values used in `filters` above).
const PROJECT_FILTERS = [
    { key: 'all', label: 'all' },
    { key: 'cpp', label: 'c++' },
    { key: 'multiplayer', label: 'multiplayer' },
    { key: 'ai', label: 'ai' },
    { key: 'vr', label: 'vr' },
    { key: 'graphics', label: 'graphics' },
];

// Tag pill colours. Anything not listed falls back to gray.
const TAG_COLORS = {
    'C++': 'tag-blue',
    'Blueprint': 'tag-blue',
    'Multiplayer': 'tag-red',
    'AI': 'tag-red',
    'VR': 'tag-red',
    'OpenGL': 'tag-red',
    'GLSL': 'tag-yellow',
    'SDL2': 'tag-green',
    'Unreal Engine': 'tag-green',
    'Unreal Engine 5': 'tag-green',
};

// ---- helpers ----
const tagPills = tags => tags.map(t => `<span class="tag ${TAG_COLORS[t] || 'tag-gray'}">${t}</span>`).join('');
const slugOf = project => project.href.split('/').pop().replace('.html', '');
const pad = n => String(n).padStart(2, '0');

function currentProjectIndex() {
    const path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '');
    return PROJECTS.findIndex(p => p.href.replace(/\.html$/, '') === path);
}

// ---- <project-grid>: filter chips + cards (home page) ----
class ProjectGrid extends HTMLElement {
    connectedCallback() {
        const chips = PROJECT_FILTERS.map(f => {
            const count = f.key === 'all' ? PROJECTS.length : PROJECTS.filter(p => p.filters.includes(f.key)).length;
            return `<button class="chip${f.key === 'all' ? ' active' : ''}" data-filter="${f.key}">${f.label} <span class="count">${count}</span></button>`;
        }).join('');

        const cards = PROJECTS.map((p, i) => `
            <a href="${p.href}" class="project-card" data-filters="${p.filters.join(' ')}">
                <div class="relative aspect-video bg-gray-200 bg-cover bg-center" style="background-image: url('${p.image}');">
                    <span class="card-index">${pad(i + 1)}</span>
                </div>
                <div class="p-4 flex flex-col flex-1">
                    <p class="card-path">~/projects/${slugOf(p)}</p>
                    <h3 class="text-xl text-blue-500 font-bold mb-1">${p.title}</h3>
                    <p class="text-gray-700 mb-3">${p.summary}</p>
                    <div class="flex flex-wrap gap-1.5 mb-4">${tagPills(p.tags)}</div>
                    <span class="see-more">See more <i class="fa-solid fa-arrow-right text-xs"></i></span>
                </div>
            </a>`).join('');

        this.innerHTML = `
            <div class="flex flex-wrap gap-2 mb-6">${chips}</div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">${cards}</div>`;

        this.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
            const filter = chip.dataset.filter;
            this.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === chip));
            this.querySelectorAll('.project-card').forEach(card => {
                card.classList.toggle('hidden', filter !== 'all' && !card.dataset.filters.split(' ').includes(filter));
            });
        }));
    }
}

// ---- <project-header>: title, tags and date at the top of a project page ----
class ProjectHeader extends HTMLElement {
    connectedCallback() {
        const p = PROJECTS[currentProjectIndex()];
        if (!p) return;

        this.innerHTML = `
            <a href="/#projects" class="back-link"><i class="fa-solid fa-arrow-left text-xs"></i> back to projects</a>
            <p class="card-path mt-6">~/projects/${slugOf(p)}</p>
            <h1 class="text-3xl md:text-4xl font-bold">${p.title}</h1>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
                <div class="flex flex-wrap gap-1.5">${tagPills(p.tags)}</div>
                <p class="font-mono text-sm text-gray-500"><i class="fa-regular fa-clock"></i> ${p.date}</p>
            </div>`;
    }
}

// ---- <project-nav>: previous / next project links at the bottom of a project page ----
class ProjectNav extends HTMLElement {
    connectedCallback() {
        const i = currentProjectIndex();
        if (i < 0) return;
        const prev = PROJECTS[(i - 1 + PROJECTS.length) % PROJECTS.length];
        const next = PROJECTS[(i + 1) % PROJECTS.length];

        this.innerHTML = `
            <nav class="grid grid-cols-2 gap-4 mt-8">
                <a href="${prev.href}" class="nav-card">
                    <span class="font-mono text-xs text-gray-400"><i class="fa-solid fa-arrow-left"></i> previous</span>
                    <span class="font-semibold text-blue-500">${prev.title}</span>
                </a>
                <a href="${next.href}" class="nav-card text-right">
                    <span class="font-mono text-xs text-gray-400">next <i class="fa-solid fa-arrow-right"></i></span>
                    <span class="font-semibold text-blue-500">${next.title}</span>
                </a>
            </nav>`;
    }
}

customElements.define('project-grid', ProjectGrid);
customElements.define('project-header', ProjectHeader);
customElements.define('project-nav', ProjectNav);
