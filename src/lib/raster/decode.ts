/**
 * Decoders for images browsers can't draw by themselves. Each ends in a PNG
 * (or JPEG, for photos) blob that the ordinary image stage can show.
 */

import type { IFD } from "utif2";

export interface TiffPage {
  width: number;
  height: number;
  ifd: IFD;
}

export interface PsdLayer {
  name: string;
  hidden: boolean;
  depth: number;
  group: boolean;
}

function toPng(pixels: Uint8Array | Uint8ClampedArray, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  const clamped = new Uint8ClampedArray(pixels.buffer as ArrayBuffer, pixels.byteOffset, width * height * 4);
  context.putImageData(new ImageData(clamped, width, height), 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't encode the decoded image."))), "image/png"),
  );
}

/** Lets the loading state paint before a synchronous decode holds the thread. */
const yieldToPaint = () => new Promise((resolve) => setTimeout(resolve, 16));

export async function decodeHeic(blob: Blob): Promise<Blob> {
  // Safari decodes HEIC itself; everyone else gets libheif.
  try {
    const bitmap = await createImageBitmap(blob);
    bitmap.close();
    return blob;
  } catch {
    const { heicTo } = await import("heic-to/csp");
    return heicTo({ blob, type: "image/jpeg", quality: 0.92 });
  }
}

const CFA = 32803;
const LINEAR_RAW = 34892;

/** Every picture in a TIFF, including a DNG's previews; raw sensor data is skipped. */
export async function readTiff(buffer: ArrayBuffer): Promise<TiffPage[]> {
  const UTIF = await import("utif2");
  const pages: TiffPage[] = [];
  const visit = (ifd: IFD) => {
    const width = Number((ifd.t256 as number[] | undefined)?.[0] ?? 0);
    const height = Number((ifd.t257 as number[] | undefined)?.[0] ?? 0);
    const photometric = Number((ifd.t262 as number[] | undefined)?.[0]);
    if (width && height && photometric !== CFA && photometric !== LINEAR_RAW) pages.push({ width, height, ifd });
    for (const sub of (ifd.subIFD as unknown as IFD[] | undefined) ?? []) visit(sub);
  };
  UTIF.decode(buffer).forEach(visit);
  return pages;
}

export async function renderTiffPage(buffer: ArrayBuffer, page: TiffPage): Promise<Blob> {
  const UTIF = await import("utif2");
  await yieldToPaint();
  UTIF.decodeImage(buffer, page.ifd);
  return toPng(UTIF.toRGBA8(page.ifd), page.ifd.width, page.ifd.height);
}

/** 16- and 32-bit documents down to the 8 bits a canvas holds. 32-bit PSDs are linear light, so they get a display gamma. */
function to8Bit(data: Uint8Array | Uint8ClampedArray | Uint16Array | Float32Array): Uint8Array | Uint8ClampedArray {
  if (data instanceof Uint8Array || data instanceof Uint8ClampedArray) return data;
  const out = new Uint8ClampedArray(data.length);
  if (data instanceof Uint16Array) {
    for (let index = 0; index < data.length; index += 1) out[index] = data[index] >> 8;
  } else {
    for (let index = 0; index < data.length; index += 1) {
      const value = data[index];
      out[index] = (index & 3) === 3 ? value * 255 : Math.pow(Math.max(0, value), 1 / 2.2) * 255;
    }
  }
  return out;
}

export async function decodePsd(buffer: ArrayBuffer): Promise<{ blob: Blob; layers: PsdLayer[] }> {
  const { readPsd } = await import("ag-psd");
  await yieldToPaint();
  const psd = readPsd(buffer, { useImageData: true, skipLayerImageData: true, skipThumbnail: true, skipLinkedFilesData: true });
  if (!psd.imageData) {
    throw new Error("This file was saved without a flattened preview (“Maximize compatibility” was off), so there is nothing to show without Photoshop's layer engine.");
  }
  const layers: PsdLayer[] = [];
  const walk = (children: typeof psd.children, depth: number) => {
    // Photoshop lists layers bottom-up; people read them top-down.
    for (const layer of [...(children ?? [])].reverse()) {
      layers.push({ name: layer.name ?? "Layer", hidden: Boolean(layer.hidden), depth, group: Boolean(layer.children) });
      walk(layer.children, depth + 1);
    }
  };
  walk(psd.children, 0);
  return { blob: await toPng(to8Bit(psd.imageData.data), psd.width, psd.height), layers };
}
