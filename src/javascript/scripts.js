// Scroll to Top
function scrollToTop() {
    window.scrollTo({top: 0, behavior: 'smooth'});
}

window.addEventListener('scroll', function ()
{
    const scrollToTopBtn = document.getElementById('scrollToTopBtn');
    if (document.documentElement.scrollTop > 120) {
        scrollToTopBtn.style.pointerEvents = 'auto'; // Enable button interaction
        scrollToTopBtn.style.opacity = '1'; // Fade in the button
    } else {
        scrollToTopBtn.style.pointerEvents = 'none'; // Disable button interaction while hidden
        scrollToTopBtn.style.opacity = '0'; // Fade out the button
    }
});

// JavaScript to toggle the mobile menu
document.getElementById('menu-toggle').addEventListener('click', function () {
    let menu = document.getElementById('mobile-menu');
    menu.classList.toggle('open');
});
