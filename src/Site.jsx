import { useLayoutEffect } from "react";

function Header({ current }) {
  const base = current ? "../" : "./";
  return (
    <header className="page-width">
      <a className="home" href={base}>Nathaniel Greisen</a>
      <nav aria-label="Main navigation">
        <a href={base + "projects/"} aria-current={current === "projects" ? "page" : undefined}>Projects</a>
        <a href={base + "notes/"} aria-current={current === "notes" ? "page" : undefined}>Notes</a>
        <a href="https://github.com/nathanielgreisen">GitHub</a>
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="page-width">
      <a href="mailto:nathaniel@greisen.dev">nathaniel@greisen.dev</a>
      <a href="https://www.linkedin.com/in/nathanielgreisen/">LinkedIn</a>
    </footer>
  );
}

function NameLetters({ children }) {
  return Array.from(children, (letter, index) => (
    <span className="name-letter" aria-hidden="true" key={index}>
      <span className="name-letter-glyph">{letter}</span>
    </span>
  ));
}

function Intro({ title, children, home = false }) {
  const headingId = home ? "name" : "page-title";
  return (
    <section className={home ? "intro home-intro" : "intro"} aria-labelledby={headingId}>
      <div className={home ? "intro-copy page-width" : "intro-copy"}>
        {home ? (
          <h1 id={headingId} aria-label="Nathaniel Greisen">
            <NameLetters>Nathaniel</NameLetters><br /><NameLetters>Greisen</NameLetters>
          </h1>
        ) : <h1 id={headingId}>{title}</h1>}
        <p>{children}</p>
      </div>
      <canvas className="intro-grid" aria-hidden="true" />
    </section>
  );
}

const projectsMessage = "I will put projects here soon! :)";
const notesMessage = "I will put notes here soon! :)";

function Home() {
  return (
    <main id="top">
      <Intro home>I code things sometimes</Intro>

      <section className="projects page-width" id="projects" aria-labelledby="projects-heading">
        <h2 id="projects-heading">Projects</h2>
        <p>{projectsMessage}</p>
      </section>
    </main>
  );
}

const placeholders = {
  projects: { title: "Projects", message: projectsMessage },
  notes: { title: "Notes", message: notesMessage },
};

export function Site({ page, mount }) {
  useLayoutEffect(() => mount?.(), [mount]);
  const home = page === "index";
  const placeholder = placeholders[page];

  return (
    <>
      {home && <canvas className="page-bubbles" aria-hidden="true" />}
      <Header current={home ? undefined : page} />
      {home ? <Home /> : (
        <main className="page-width">
          <Intro title={placeholder.title}>{placeholder.message}</Intro>
        </main>
      )}
      <Footer />
    </>
  );
}
