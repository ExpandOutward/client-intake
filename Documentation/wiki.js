const navLinks = [...document.querySelectorAll("nav a")];
const sections = [...document.querySelectorAll("main section[id]")];

function setActive(id) {
  navLinks.forEach((link) => {
    const href = link.getAttribute("href") || "";
    const hash = href.startsWith("#") ? href.slice(1) : "";
    link.classList.toggle("is-active", Boolean(id) && hash === id);
  });
}

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    const href = link.getAttribute("href") || "";
    if (href.startsWith("#")) setActive(href.slice(1));
  });
});

if (sections.length && "IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActive(visible.target.id);
    },
    { rootMargin: "-15% 0px -65% 0px", threshold: [0.1, 0.5, 1] },
  );
  sections.forEach((section) => observer.observe(section));
}

const initial = location.hash.replace(/^#/, "");
if (initial) setActive(initial);
else if (sections[0]) setActive(sections[0].id);
