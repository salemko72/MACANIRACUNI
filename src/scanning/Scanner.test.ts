import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Scanner } from "./Scanner";
import { DocumentPreview } from "./DocumentPreview";
describe("scanning entry points", () => {
  it("offers real mobile camera capture and an independent PDF upload", () => {
    const html = renderToStaticMarkup(
      createElement(Scanner, {
        bills: [],
        month: "2026-10",
        property: "nisici",
        onSave: async () => {},
        onDone: () => {},
      }),
    );
    expect(html).toContain('capture="environment"');
    expect(html).toContain("application/pdf");
    expect(html.match(/type="file"/g)).toHaveLength(2);
    expect(html).toContain("Fotografiši račun");
  });
  it("communicates local original availability before browser storage loads", () => {
    const html = renderToStaticMarkup(
      createElement(DocumentPreview, { documentId: "synthetic-id" }),
    );
    expect(html).toContain("ovom uređaju");
    expect(html).toContain("Učitavanje originala");
  });
});
