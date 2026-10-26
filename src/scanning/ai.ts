import type { ScanSuggestion } from "./extraction";

export async function readWithAi(
  image: HTMLCanvasElement,
  signal?: AbortSignal,
): Promise<ScanSuggestion> {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 2000 / Math.max(image.width, image.height));
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Fotografiju nije moguće pripremiti.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const encoded = canvas.toDataURL("image/jpeg", 0.92);
  canvas.width = canvas.height = 1;
  const controller = new AbortController();
  const stop = () => controller.abort();
  signal?.addEventListener("abort", stop, { once: true });
  if (signal?.aborted) stop();
  const timeout = setTimeout(stop, 60_000);
  try {
    const response = await fetch("/api/scan", {
      method: "POST",
      credentials: "same-origin",
      redirect: "manual",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: encoded }),
      signal: controller.signal,
    });
    if (
      response.type === "opaqueredirect" ||
      response.status === 401 ||
      response.status === 403 ||
      response.status === 302
    )
      throw new Error(
        "Za AI čitanje prvo se prijavi porodičnim emailom. Nakon prijave vrati se na skeniranje.",
      );
    if (response.status === 429)
      throw new Error(
        "Današnji limit AI čitanja je potrošen. Možeš koristiti čitanje na uređaju ili pokušati sutra.",
      );
    if (!response.ok)
      throw new Error(
        "AI čitač trenutno nije dostupan. Pokušaj ponovo ili izaberi čitanje na uređaju.",
      );
    if (!response.headers.get("Content-Type")?.includes("application/json"))
      throw new Error("Za AI čitanje prvo se prijavi porodičnim emailom.");
    const result = (await response.json()) as ScanSuggestion;
    if (
      result.engine !== "ai" ||
      typeof result.text !== "string" ||
      !Array.isArray(result.warnings)
    )
      throw new Error("AI nije vratio čitljiv rezultat. Pokušaj ponovo.");
    return result;
  } catch (error) {
    if (signal?.aborted)
      throw new DOMException("Skeniranje je prekinuto.", "AbortError");
    if (controller.signal.aborted)
      throw new Error("AI čitanje je predugo trajalo. Pokušaj ponovo.");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", stop);
  }
}
