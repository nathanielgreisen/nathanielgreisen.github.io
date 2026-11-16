import { useLayoutEffect } from "react";
import { mountInteractions } from "./interactions.js";

function Header({ current }) {
  return (
    <header className="page-width">
      <a className="home" href="index.html">Nathaniel Greisen</a>
      <nav aria-label="Main navigation">
        <a href="projects.html" aria-current={current === "projects" ? "page" : undefined}>Projects</a>
        <a href="notes.html" aria-current={current === "notes" ? "page" : undefined}>Notes</a>
        <a href="https://github.com/nathanielgreisen">GitHub</a>
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="page-width">
      <a href="mailto:nlgreisen@gmail.com">nlgreisen@gmail.com</a>
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

function SoftwareProjects() {
  return (
    <>
      <details>
        <summary>
          <span className="project-name">Canvas to Notion</span>
          <span className="description">Copies coursework from Canvas into a Notion table.</span>
          <span className="toggle" aria-hidden="true"></span>
        </summary>
        <div className="project-detail">
          <p>A Chrome extension reads assignments from a signed-in Canvas tab and sends them through a local Python server. The sync checks the Notion table before writing, skips duplicates, and preserves changes to fields like status on existing assignments. Canvas session cookies stay in Chrome.</p>
          <a href="https://github.com/nathanielgreisen/Canvas-to-Notion">View source on GitHub</a>
        </div>
      </details>
      <details>
        <summary>
          <span className="project-name">Playtime Tracker</span>
          <span className="description">Tracks time spent on a Minecraft server.</span>
          <span className="toggle" aria-hidden="true"></span>
        </summary>
        <div className="project-detail">
          <p>This Java plugin stores accumulated playtime in YAML using each player’s UUID. The <code>/playtime</code> command adds the current session to the saved total, so players can see their time before they log off.</p>
          <a href="https://github.com/nathanielgreisen/PlaytimeTracker">View source on GitHub</a>
        </div>
      </details>
      <details>
        <summary>
          <span className="project-name">Robotics and autonomy</span>
          <span className="description">Autonomous driving for competition robots.</span>
          <span className="toggle" aria-hidden="true"></span>
        </summary>
        <div className="project-detail">
          <p>I work on C++ software for the Long Knights’ VEX U robots. My focus is the autonomous period, when the robot runs a sequence of actions without driver input. Developing those routines means testing how consistently the robot can repeat a move on the field.</p>
        </div>
      </details>
    </>
  );
}

function Home() {
  return (
    <main id="top">
      <Intro home>I study computer science at California Baptist University. I build software for the web and work on autonomous driving with the Long Knights robotics team.</Intro>

      <section className="projects page-width" id="projects" aria-labelledby="projects-heading">
        <h2 id="projects-heading">Selected projects</h2>
        <div className="project-list">
          <SoftwareProjects />
          <a className="more" href="projects.html">View all projects</a>
        </div>
      </section>
    </main>
  );
}

function Projects() {
  return (
    <main className="page-width">
      <Intro title="Projects">Web tools, a Minecraft plugin, and work on autonomous robots.</Intro>
      <section className="projects" aria-labelledby="real-projects">
        <h2 id="real-projects">Software projects</h2>
        <div className="project-list">
          <SoftwareProjects />
        </div>
      </section>
      <section className="projects" aria-labelledby="sample-projects">
        <h2 id="sample-projects">Sample projects</h2>
        <div className="project-list">
          <details>
            <summary>
              <span className="project-name">Robot Log Replay</span>
              <span className="description">A viewer for recorded robot telemetry.</span>
              <span className="toggle" aria-hidden="true"></span>
            </summary>
            <div className="project-detail">
              <p>This fictional tool reads position, heading, and motor output from a CSV file. A scrubber lets the operator compare what the robot did with what the autonomous routine expected at that point in time.</p>
            </div>
          </details>
          <details>
            <summary>
              <span className="project-name">Fixture Check</span>
              <span className="description">A command-line validator for test data.</span>
              <span className="toggle" aria-hidden="true"></span>
            </summary>
            <div className="project-detail">
              <p>This fictional utility validates JSON fixtures before a test run. It reports missing fields and type mismatches alongside the file and field that caused them.</p>
            </div>
          </details>
        </div>
      </section>
    </main>
  );
}

function Notes() {
  return (
    <main className="page-width">
      <Intro title="Notes">Notes on browser graphics, debugging, and testing software.</Intro>
      <section className="index" aria-label="Notes">
        <article className="index-entry">
          <h2><a href="replaying-robot-logs.html">Replaying a robot run from a log</a></h2>
          <p>How timestamps and control inputs make a motion bug easier to reproduce.</p>
        </article>
        <article className="index-entry">
          <h2><a href="replaying-robot-logs.html#fixtures">Turning a bug into a test fixture</a></h2>
          <p>What to keep from a failed run when you want to test a specific behavior.</p>
        </article>
        <article className="index-entry">
          <h2><a href="experiments.html">Drawing the background grid</a></h2>
          <p>How the canvas responds to the pointer behind selectable text.</p>
        </article>
      </section>
    </main>
  );
}

function GridNote() {
  return (
    <main className="page-width">
      <Intro title="Drawing the background grid">Implementation notes for this site’s canvas background.</Intro>
      <article className="article">
        <h2>Deforming the grid</h2>
        <p>The grid is drawn as straight lines with points sampled along each one. Near the cursor, a point moves outward by an amount that depends on its distance from the cursor. Points outside that radius stay in place.</p>
        <h2>Drawing behind the page</h2>
        <p>The introduction handles pointer movement while the canvas sits behind the text. That keeps the text selectable. The grid settles when the pointer leaves, and the animation stops requesting frames once it has settled.</p>
        <a href="notes.html">Back to notes</a>
      </article>
    </main>
  );
}

function RobotLogs() {
  return (
    <main className="page-width">
      <Intro title="Replaying a robot run from a log">A sample engineering note using fictional telemetry.</Intro>
      <article className="article">
        <h2>Record inputs alongside motion</h2>
        <p>A position trace tells you where the robot ended up. Recording the target heading and motor commands on the same clock lets you see whether the controller asked for the wrong turn or the robot failed to follow the right command.</p>
        <div className="telemetry-scroll">
          <table className="telemetry">
            <caption>Sample telemetry</caption>
            <thead>
              <tr><th scope="col">Time (ms)</th><th scope="col">Target (°)</th><th scope="col">Heading (°)</th><th scope="col">Left motor</th><th scope="col">Right motor</th></tr>
            </thead>
            <tbody>
              <tr><th scope="row">1200</th><td>90</td><td>72</td><td>0.38</td><td>−0.38</td></tr>
              <tr><th scope="row">1220</th><td>90</td><td>76</td><td>0.31</td><td>−0.31</td></tr>
              <tr><th scope="row">1240</th><td>90</td><td>81</td><td>0.22</td><td>−0.22</td></tr>
            </tbody>
          </table>
        </div>
        <h2 id="fixtures">Turn a short segment into a test fixture</h2>
        <p>Keep the window around the first wrong command and enough earlier samples to establish the controller’s state. Replay the inputs in timestamp order, then check the behavior that failed. For a turn, that might mean verifying that the steering command changes sign after the heading passes the target.</p>
        <a href="notes.html">Back to notes</a>
      </article>
    </main>
  );
}

const pages = {
  index: Home,
  projects: Projects,
  notes: Notes,
  experiments: GridNote,
  "replaying-robot-logs": RobotLogs,
};

export function Site({ page, container }) {
  useLayoutEffect(() => mountInteractions(container), [container]);
  const Page = pages[page];
  const current = page === "index" ? undefined : page === "projects" ? "projects" : "notes";

  return (
    <>
      {page === "index" && <canvas className="page-bubbles" aria-hidden="true" />}
      <Header current={current} />
      <Page />
      <Footer />
    </>
  );
}
