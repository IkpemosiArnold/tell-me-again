import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import "./styles.css";
import { Toaster } from "./ui/common.jsx";
import { Home, NewSession, Consent } from "./ui/start.jsx";
import { Record } from "./ui/record.jsx";
import { Session, Story } from "./ui/session.jsx";
import { Book } from "./ui/book.jsx";
import { Archive, About } from "./ui/more.jsx";

// hash routes, so the browser's back button works and the host needs no rewrites
function route(hash) {
  const p = hash.replace(/^#/, "") || "/";
  let m;
  if (p === "/new") return <NewSession />;
  if (p === "/archive") return <Archive />;
  if (p === "/about") return <About />;
  if ((m = /^\/s\/([\w-]+)\/consent$/.exec(p))) return <Consent id={m[1]} />;
  if ((m = /^\/s\/([\w-]+)\/record$/.exec(p))) return <Record id={m[1]} />;
  if ((m = /^\/s\/([\w-]+)\/book$/.exec(p))) return <Book id={m[1]} />;
  if ((m = /^\/s\/([\w-]+)\/t\/([\w-]+)$/.exec(p))) return <Story id={m[1]} storyId={m[2]} />;
  if ((m = /^\/s\/([\w-]+)$/.exec(p))) return <Session id={m[1]} />;
  return <Home />;
}

function App() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => {
      setHash(location.hash);
      window.scrollTo(0, 0);
    };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return (
    <>
      <div key={hash.split("/").slice(0, 4).join("/")} style={{ display: "contents" }}>
        {route(hash)}
      </div>
      <Toaster />
    </>
  );
}

render(<App />, document.getElementById("app"));
