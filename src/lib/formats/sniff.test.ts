import { describe, expect, it } from "vitest";
import { formatByName } from "./registry";
import { looksLikeText, sniff } from "./sniff";

const bytes = (...parts: Array<string | number[]>) =>
  new Uint8Array(parts.flatMap((part) => (typeof part === "string" ? [...part].map((c) => c.charCodeAt(0)) : part)));

describe("sniff", () => {
  it("trusts magic bytes over a misleading name", () => {
    expect(sniff(bytes("%PDF-1.7"), "scan.bin").id).toBe("pdf");
    expect(sniff(bytes("SQLite format 3\0"), "data.bin").id).toBe("sqlite");
    expect(sniff(bytes([0x89, 0x50, 0x4e, 0x47]), "picture").id).toBe("image");
  });

  it("does not take a non-SQLite .db for a database", () => {
    expect(sniff(bytes("key=value\n"), "settings.db").viewer).toBe("code");
  });

  it("tells Office files apart inside their zip envelope", () => {
    const zip = [0x50, 0x4b, 0x03, 0x04];
    expect(sniff(bytes(zip, "....word/document.xml"), "file").id).toBe("docx");
    expect(sniff(bytes(zip, "....ppt/slides/slide1.xml"), "file").id).toBe("pptx");
    expect(sniff(bytes(zip, "....mimetypeapplication/epub+zip"), "book.zip").id).toBe("epub");
    expect(sniff(bytes(zip, "....readme.txt"), "bundle.zip").id).toBe("zip");
    expect(sniff(bytes(zip, "...."), "deck.pptx").id).toBe("pptx");
  });

  it("reads ISO-BMFF and RIFF brands", () => {
    expect(sniff(bytes([0, 0, 0, 24], "ftypheic"), "IMG_0001").id).toBe("heic");
    expect(sniff(bytes([0, 0, 0, 24], "ftypisom"), "clip").id).toBe("video");
    expect(sniff(bytes("RIFF", [0, 0, 0, 0], "WEBP"), "x").id).toBe("image");
  });

  it("keeps the name when it agrees with the signature's family", () => {
    expect(sniff(bytes("OggS"), "clip.ogv").id).toBe("video");
  });

  it("falls back to text, then to hex", () => {
    expect(sniff(bytes("hello world\n"), "NOTES").id).toBe("text");
    expect(sniff(bytes('{"a": 1}'), "response").id).toBe("json");
    expect(sniff(bytes([0, 1, 2, 3, 0, 0, 7]), "blob").id).toBe("binary");
    expect(sniff(bytes([0, 1, 2, 3]), "main.ts").id).toBe("binary");
  });
});

describe("formatByName", () => {
  it("knows extensionless and compound names", () => {
    expect(formatByName("Dockerfile")?.id).toBe("dockerfile");
    expect(formatByName(".env.local")?.id).toBe("ini");
    expect(formatByName("types.d.ts")?.id).toBe("typescript");
    expect(formatByName("backup.tar.gz")?.id).toBe("tar");
  });
});

describe("looksLikeText", () => {
  it("accepts Latin-1 and rejects NULs", () => {
    expect(looksLikeText(bytes([0x63, 0x61, 0x66, 0xe9]))).toBe(true);
    expect(looksLikeText(bytes([0x61, 0x00, 0x62]))).toBe(false);
  });
});
