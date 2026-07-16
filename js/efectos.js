/ Animación suave al hacer scroll
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
});