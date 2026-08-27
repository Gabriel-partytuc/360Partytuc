// Animación suave al hacer scroll
document.addEventListener('DOMContentLoaded', () => {
    // Resaltar enlace del menú según la sección visible
    const secciones = document.querySelectorAll('section');
    const enlaces = document.querySelectorAll('.menu a');

    window.addEventListener('scroll', () => {
        let actual = '';
        secciones.forEach(seccion => {
            const seccionTop = seccion.offsetTop;
            const seccionAltura = seccion.clientHeight;
            if (scrollY >= seccionTop - 200) {
                actual = seccion.getAttribute('id');
            }
        });

        enlaces.forEach(enlace => {
            enlace.style.color = 'white';
            enlace.style.textShadow = 'none';
            if (enlace.getAttribute('href') === `#${actual}`) {
                enlace.style.color = 'var(--celeste-neon)';
                enlace.style.textShadow = 'var(--sombra-celeste)';
            }
        });
    });

    // Menú hamburguesa (mobile)
    const botonHamburguesa = document.querySelector('.menu-hamburguesa');
    const menu = document.querySelector('.menu');
    if (botonHamburguesa && menu) {
        botonHamburguesa.addEventListener('click', () => {
            const abierto = menu.classList.toggle('abierto');
            botonHamburguesa.classList.toggle('abierto', abierto);
            botonHamburguesa.setAttribute('aria-expanded', abierto);
        });

        menu.querySelectorAll('a').forEach(enlace => {
            enlace.addEventListener('click', () => {
                menu.classList.remove('abierto');
                botonHamburguesa.classList.remove('abierto');
                botonHamburguesa.setAttribute('aria-expanded', 'false');
            });
        });
    }
});