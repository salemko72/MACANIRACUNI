import { useEffect, useState } from "react";

type State = "checking" | "active" | "login" | "unavailable" | "offline";
export function AiConnection({ email }: { email: string }) {
  const [state, setState] = useState<State>("checking");
  const [checkedAt, setCheckedAt] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function check() {
      if (busy || document.visibilityState === "hidden") return;
      if (!navigator.onLine) {
        setState("offline");
        return;
      }
      busy = true;
      try {
        const response = await fetch("/api/ai/status", {
          credentials: "same-origin",
          redirect: "manual",
          cache: "no-store",
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (
          response.type === "opaqueredirect" ||
          response.status === 401 ||
          response.status === 403
        ) {
          setState("login");
          return;
        }
        if (
          !response.headers.get("Content-Type")?.includes("application/json")
        ) {
          setState("login");
          return;
        }
        const data = await response.json();
        if (controller.signal.aborted) return;
        setState(
          response.ok && data.active === true ? "active" : "unavailable",
        );
        setCheckedAt(typeof data.checkedAt === "string" ? data.checkedAt : "");
      } catch {
        if (!controller.signal.aborted)
          setState(navigator.onLine ? "unavailable" : "offline");
      } finally {
        busy = false;
      }
    }
    void check();
    const focus = () => void check();
    const timer = setInterval(focus, 60000);
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    window.addEventListener("offline", focus);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
      window.removeEventListener("offline", focus);
    };
  }, [email]);
  const labels = {
    checking: "Mistral: provjera veze…",
    active: "Veza sa Mistralom aktivna",
    login: "Mistral: potrebna prijava",
    unavailable: "Mistral: veza nije potvrđena",
    offline: "Mistral: bez interneta",
  };
  return (
    <div
      className={"ai-connection ai-connection-" + state}
      role="status"
      aria-label="Stanje veze s Mistralom"
      title={
        checkedAt
          ? "Zadnja provjera: " +
            new Date(checkedAt).toLocaleTimeString("bs-BA", {
              timeZone: "Europe/Sarajevo",
            })
          : undefined
      }
    >
      <span aria-hidden="true">●</span> {labels[state]}
    </div>
  );
}
