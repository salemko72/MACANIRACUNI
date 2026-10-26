import { useEffect, useState } from "react";

const build = __APP_BUILD__;
const parts = Object.fromEntries(
  new Intl.DateTimeFormat("bs-BA", {
    timeZone: "Europe/Sarajevo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date(build.builtAt))
    .map((part) => [part.type, part.value]),
);
const date = `${parts.day}.${parts.month}.${parts.year}. ${parts.hour}:${parts.minute}:${parts.second}`;

export function BuildVersion() {
  const [newer, setNewer] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    const check = async () => {
      if (running || !navigator.onLine || document.visibilityState === "hidden")
        return;
      running = true;
      try {
        const response = await fetch("/version.json", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const latest = await response.json();
        if (
          typeof latest.id === "string" &&
          typeof latest.builtAt === "string" &&
          latest.id !== build.id &&
          Date.parse(latest.builtAt) > Date.parse(build.builtAt)
        )
          setNewer(true);
      } catch {
        /* Offline pages still display the exact build they loaded. */
      } finally {
        running = false;
      }
    };
    void check();
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const timer = setInterval(onFocus, 60_000);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);
  async function refresh() {
    setRefreshing(true);
    setRefreshError(false);
    try {
      if ("serviceWorker" in navigator) {
        if (!navigator.onLine) throw new Error("offline");
        const registration = await navigator.serviceWorker.getRegistration();
        await registration?.update();
        const pending = registration?.installing ?? registration?.waiting;
        if (pending && pending.state !== "activated") {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
              pending.removeEventListener("statechange", changed);
              reject(new Error("update_timeout"));
            }, 15_000);
            const changed = () => {
              if (pending.state === "installed")
                pending.postMessage({ type: "SKIP_WAITING" });
              if (
                pending.state === "activated" ||
                pending.state === "redundant"
              ) {
                clearTimeout(timer);
                pending.removeEventListener("statechange", changed);
                if (pending.state === "activated") resolve();
                else reject(new Error("update_failed"));
              }
            };
            pending.addEventListener("statechange", changed);
            changed();
          });
        }
      }
      location.reload();
    } catch {
      setRefreshing(false);
      setRefreshError(true);
    }
  }
  return (
    <div className="build-version">
      <time
        aria-label="Učitana verzija aplikacije"
        dateTime={build.builtAt}
        title={"Učitana verzija · Sarajevo · " + build.id}
      >
        Zadnja izmjena: {date}
      </time>
      {newer ? (
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          aria-label="Dostupna novija verzija — osvježi"
        >
          {refreshing ? "Osvježavanje…" : "Nova verzija · Osvježi"}
        </button>
      ) : null}
      {refreshError ? (
        <span role="status">Pokušaj osvježiti ponovo.</span>
      ) : null}
    </div>
  );
}
