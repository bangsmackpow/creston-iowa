/* home.js - homepage interactions */
(function() {
  // Animate stats on scroll
  const stats = document.querySelectorAll('.stat strong');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.animation = 'fadeInUp 0.6s ease forwards';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });
  stats.forEach(stat => observer.observe(stat));
})();
