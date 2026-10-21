// Shared layout for every page: <site-header>, <site-footer>, analytics.
// Loaded in <head> (not deferred) so the elements render as soon as the parser reaches them.

// ---- Google Analytics ----
(function loadAnalytics() {
    const id = 'G-KEGQVW1PYF';
    const tag = document.createElement('script');
    tag.async = true;
    tag.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    document.head.appendChild(tag);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
    gtag('js', new Date());
    gtag('config', id);
})();

// ---- Social links (used in the header menu, footer and home page) ----
const SOCIALS = {
    linkedin: 'https://www.linkedin.com/in/rishikhanna47/',
    github: 'https://github.com/DarkParasite',
    fiverr: 'https://www.fiverr.com/darkparasite/',
    email: 'rishikhannalive@gmail.com',
};

const NAV_LINKS = [
    { label: 'work', href: '/#work' },
    { label: 'resume', href: '/pages/resume.html' },
    { label: 'contact', href: '/pages/contact.html' },
];

// ---- <site-header> ----
class SiteHeader extends HTMLElement {
    connectedCallback() {
        const links = NAV_LINKS.map(l => `<li><a class="hover:text-blue-400" href="${l.href}">${l.label}</a></li>`).join('');

        this.innerHTML = `
            <header class="sticky top-0 z-40 bg-black text-white">
                <div class="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
                    <a href="/" class="text-xl font-bold hover:text-blue-400">
                        <span class="font-mono text-blue-400">~/</span>Rishi Khanna
                    </a>
                    <nav class="hidden md:block font-mono text-sm">
                        <ul class="flex space-x-6">${links}</ul>
                    </nav>
                    <button class="menu-toggle md:hidden text-2xl" aria-label="Open menu">&#9776;</button>
                </div>
                <nav class="mobile-menu md:hidden font-mono">
                    <ul class="flex flex-col space-y-4 p-4">${links}</ul>
                </nav>
            </header>`;

        const menu = this.querySelector('.mobile-menu');
        this.querySelector('.menu-toggle').addEventListener('click', () => menu.classList.toggle('open'));
        menu.addEventListener('click', e => { if (e.target.closest('a')) menu.classList.remove('open'); });
    }
}

// ---- <site-footer> (also adds the scroll-to-top button) ----
class SiteFooter extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <button class="scroll-top" aria-label="Scroll to top"><i class="fa-solid fa-arrow-up"></i></button>
            <footer class="bg-black text-white">
                <div class="max-w-6xl mx-auto px-4 py-8 flex flex-col md:flex-row gap-4 justify-between items-center">
                    <p class="font-bold">Rishi Khanna</p>
                    <div class="flex items-center gap-5 text-xl">
                        <a href="${SOCIALS.linkedin}" class="hover:text-blue-400" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"><i class="fa-brands fa-linkedin"></i></a>
                        <a href="${SOCIALS.github}" class="hover:text-purple-400" target="_blank" rel="noopener noreferrer" aria-label="GitHub"><i class="fa-brands fa-github"></i></a>
                        <a href="mailto:${SOCIALS.email}" class="hover:text-blue-400" aria-label="Email"><i class="fa-solid fa-envelope"></i></a>
                    </div>
                    <p class="text-sm text-gray-400">© ${new Date().getFullYear()} Rishi Khanna. All rights reserved.</p>
                </div>
            </footer>`;

        const button = this.querySelector('.scroll-top');
        button.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
        const update = () => button.classList.toggle('visible', document.documentElement.scrollTop > 120);
        window.addEventListener('scroll', update, { passive: true });
        update();
    }
}

customElements.define('site-header', SiteHeader);
customElements.define('site-footer', SiteFooter);
