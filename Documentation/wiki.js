const navLinks = [...document.querySelectorAll("nav a")];
const sections = [...document.querySelectorAll("main section[id]")];
const scroller = document.querySelector("main");

function setActive(id) {
  navLinks.forEach((link) => {
    const href = link.getAttribute("href") || "";
    const hash = href.startsWith("#") ? href.slice(1) : "";
    link.classList.toggle("is-active", Boolean(id) && hash === id);
  });
}

function scrollToId(id) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  setActive(id);
}

navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = link.getAttribute("href") || "";
    if (!href.startsWith("#")) return;
    event.preventDefault();
    const id = href.slice(1);
    history.replaceState(null, "", href);
    scrollToId(id);
  });
});

if (sections.length && scroller && "IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActive(visible.target.id);
    },
    {
      root: scroller,
      rootMargin: "-15% 0px -65% 0px",
      threshold: [0.1, 0.5, 1],
    },
  );
  sections.forEach((section) => observer.observe(section));
}

const initial = location.hash.replace(/^#/, "");
if (initial) scrollToId(initial);
else if (sections[0]) setActive(sections[0].id);
