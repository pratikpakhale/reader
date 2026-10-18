import type { SheetData, WorkerRequest, WorkerResponse } from "./protocol";

export interface Workbook {
  names: string[];
  sheet(index: number): Promise<SheetData>;
}

/**
 * Parses a workbook in a worker, so a fifty-megabyte .xlsx never freezes the
 * page. The worker keeps the workbook and converts a sheet only when asked;
 * aborting `signal` terminates it.
 */
export function openWorkbook(blob: Blob, signal: AbortSignal): Promise<Workbook> {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  signal.addEventListener("abort", () => worker.terminate(), { once: true });
  const send = (request: WorkerRequest, transfer: Transferable[] = []) => worker.postMessage(request, transfer);

  const pending = new Map<number, { resolve: (data: SheetData) => void; reject: (error: Error) => void }>();
  const sheets = new Map<number, Promise<SheetData>>();

  return new Promise((resolve, reject) => {
    worker.addEventListener("error", (event) => {
      const error = new Error(event.message || "The spreadsheet parser crashed");
      reject(error);
      // A crash after opening would otherwise leave a sheet loading forever.
      pending.forEach(({ reject }) => reject(error));
      pending.clear();
    });
    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === "opened") {
        resolve({
          names: message.names,
          sheet(index) {
            let promise = sheets.get(index);
            if (!promise) {
              promise = new Promise<SheetData>((resolve, reject) => {
                pending.set(index, { resolve, reject });
                send({ type: "sheet", index });
              });
              sheets.set(index, promise);
            }
            return promise;
          },
        });
      } else if (message.type === "sheet") {
        pending.get(message.index)?.resolve(message.data);
        pending.delete(message.index);
      } else if (message.index !== undefined) {
        pending.get(message.index)?.reject(new Error(message.message));
        pending.delete(message.index);
      } else {
        reject(new Error(message.message));
      }
    });
    blob.arrayBuffer().then((buffer) => send({ type: "open", buffer }, [buffer]), reject);
  });
}
