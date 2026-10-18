/**
 * Every format the reader knows, and which viewer draws it. Detection, the
 * landing page, the file picker's `accept` and the "view as" menu all read
 * from here, so they cannot disagree about what is supported.
 */

export type ViewerId =
  | "pdf"
  | "image"
  | "raster" // decoded to pixels in JS: HEIC, TIFF, PSD
  | "video"
  | "audio"
  | "code"
  | "markdown"
  | "json"
  | "table"
  | "html"
  | "notebook"
  | "docx"
  | "sheet"
  | "slides"
  | "epub"
  | "rtf"
  | "email"
  | "archive"
  | "font"
  | "model"
  | "sqlite"
  | "parquet"
  | "hex";

export type Family =
  | "documents"
  | "data"
  | "images"
  | "media"
  | "code"
  | "archives"
  | "3d"
  | "fonts";

export interface Format {
  id: string;
  label: string;
  family: Family;
  viewer: ViewerId;
  extensions: string[];
  mimes?: string[];
  /** Language id handed to the code viewer, when the viewer is `code`. */
  language?: string;
}

const code = (
  id: string,
  label: string,
  extensions: string[],
  language = id,
  mimes?: string[],
): Format => ({ id, label, family: "code", viewer: "code", extensions, language, mimes });

export const FORMATS: Format[] = [
  // Documents
  { id: "pdf", label: "PDF", family: "documents", viewer: "pdf", extensions: ["pdf", "ai"], mimes: ["application/pdf"] },
  { id: "docx", label: "Word", family: "documents", viewer: "docx", extensions: ["docx", "docm", "dotx"], mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"] },
  { id: "pptx", label: "PowerPoint", family: "documents", viewer: "slides", extensions: ["pptx", "ppsx", "potx"], mimes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"] },
  { id: "epub", label: "EPUB", family: "documents", viewer: "epub", extensions: ["epub"], mimes: ["application/epub+zip"] },
  { id: "rtf", label: "Rich Text", family: "documents", viewer: "rtf", extensions: ["rtf"], mimes: ["application/rtf", "text/rtf"] },
  { id: "markdown", label: "Markdown", family: "documents", viewer: "markdown", extensions: ["md", "markdown", "mdx", "mdown", "mkd"], mimes: ["text/markdown"] },
  { id: "html", label: "HTML", family: "documents", viewer: "html", extensions: ["html", "htm", "xhtml"], mimes: ["text/html"], language: "html" },
  { id: "email", label: "Email", family: "documents", viewer: "email", extensions: ["eml", "mht", "mhtml"], mimes: ["message/rfc822"] },
  { id: "text", label: "Text", family: "documents", viewer: "code", extensions: ["txt", "text", "log", "nfo", "me", "readme"], mimes: ["text/plain"], language: "text" },
  { id: "subtitle", label: "Subtitles", family: "documents", viewer: "code", extensions: ["srt", "vtt", "ass", "ssa", "sub"], language: "text" },

  // Data
  { id: "xlsx", label: "Spreadsheet", family: "data", viewer: "sheet", extensions: ["xlsx", "xlsm", "xlsb", "xls", "ods", "numbers", "fods"], mimes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "application/vnd.oasis.opendocument.spreadsheet"] },
  { id: "csv", label: "CSV", family: "data", viewer: "table", extensions: ["csv", "tsv", "tab", "psv"], mimes: ["text/csv", "text/tab-separated-values"] },
  { id: "json", label: "JSON", family: "data", viewer: "json", extensions: ["json", "jsonc", "json5", "geojson", "topojson", "har", "webmanifest", "jsonl", "ndjson"], mimes: ["application/json", "application/geo+json"], language: "json" },
  { id: "notebook", label: "Jupyter", family: "data", viewer: "notebook", extensions: ["ipynb"] },
  { id: "sqlite", label: "SQLite", family: "data", viewer: "sqlite", extensions: ["sqlite", "sqlite3", "db", "db3", "s3db", "sl3"], mimes: ["application/vnd.sqlite3", "application/x-sqlite3"] },
  { id: "parquet", label: "Parquet", family: "data", viewer: "parquet", extensions: ["parquet", "pq"] },
  code("yaml", "YAML", ["yaml", "yml"]),
  code("toml", "TOML", ["toml"]),
  code("xml", "XML", ["xml", "xsd", "xsl", "xslt", "plist", "rss", "atom", "kml", "gpx", "csproj", "fsproj", "vcxproj", "resx", "storyboard", "xib"], "xml", ["application/xml", "text/xml"]),
  code("ini", "INI", ["ini", "cfg", "conf", "properties", "env", "editorconfig", "gitconfig", "npmrc"], "ini"),
  code("sql", "SQL", ["sql", "psql", "mysql"]),
  code("graphql", "GraphQL", ["graphql", "gql"]),
  code("prisma", "Prisma", ["prisma"]),
  code("proto", "Protobuf", ["proto"]),

  // Images
  { id: "image", label: "Image", family: "images", viewer: "image", extensions: ["jpg", "jpeg", "jfif", "pjpeg", "png", "apng", "gif", "webp", "avif", "bmp", "ico", "cur"], mimes: ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "image/bmp", "image/x-icon", "image/vnd.microsoft.icon", "image/apng"] },
  { id: "svg", label: "SVG", family: "images", viewer: "image", extensions: ["svg", "svgz"], mimes: ["image/svg+xml"], language: "xml" },
  { id: "heic", label: "HEIC", family: "images", viewer: "raster", extensions: ["heic", "heif", "hif"], mimes: ["image/heic", "image/heif"] },
  { id: "tiff", label: "TIFF", family: "images", viewer: "raster", extensions: ["tif", "tiff", "dng"], mimes: ["image/tiff"] },
  { id: "psd", label: "Photoshop", family: "images", viewer: "raster", extensions: ["psd", "psb"], mimes: ["image/vnd.adobe.photoshop"] },

  // Media
  { id: "video", label: "Video", family: "media", viewer: "video", extensions: ["mp4", "m4v", "webm", "mov", "mkv", "ogv", "3gp", "avi", "mpeg", "mpg", "m2ts"], mimes: ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska", "video/ogg", "video/3gpp"] },
  { id: "audio", label: "Audio", family: "media", viewer: "audio", extensions: ["mp3", "wav", "ogg", "oga", "opus", "flac", "m4a", "aac", "weba", "aiff", "aif", "caf"], mimes: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/flac", "audio/mp4", "audio/aac", "audio/webm", "audio/x-wav", "audio/opus"] },

  // Archives
  { id: "zip", label: "Archive", family: "archives", viewer: "archive", extensions: ["zip", "cbz", "jar", "apk", "ipa", "xpi", "crx", "whl", "nupkg", "vsix", "odt", "odp", "key", "pages", "sketch"], mimes: ["application/zip", "application/x-zip-compressed"] },
  { id: "tar", label: "Archive", family: "archives", viewer: "archive", extensions: ["tar", "tgz", "gz", "gzip", "tbz", "tbz2", "bz2", "xz", "txz", "lzma", "zst"], mimes: ["application/x-tar", "application/gzip", "application/x-gzip", "application/x-bzip2", "application/x-xz"] },
  { id: "rar", label: "Archive", family: "archives", viewer: "archive", extensions: ["rar", "cbr", "7z", "cb7", "iso", "cpio", "lha", "lzh", "cab", "xar", "pkg", "deb", "rpm", "ar"], mimes: ["application/vnd.rar", "application/x-rar-compressed", "application/x-7z-compressed"] },

  // 3D
  { id: "model", label: "3D model", family: "3d", viewer: "model", extensions: ["glb", "gltf", "obj", "stl", "ply", "fbx", "3mf", "dae", "usdz", "3ds"], mimes: ["model/gltf-binary", "model/gltf+json", "model/stl", "model/obj"] },

  // Fonts
  { id: "font", label: "Font", family: "fonts", viewer: "font", extensions: ["ttf", "otf", "woff", "woff2", "ttc"], mimes: ["font/ttf", "font/otf", "font/woff", "font/woff2", "application/font-woff"] },

  // Code — the long tail. Anything textual not listed here still opens as text.
  code("typescript", "TypeScript", ["ts", "mts", "cts"]),
  code("tsx", "TSX", ["tsx"]),
  code("javascript", "JavaScript", ["js", "mjs", "cjs"], "javascript", ["text/javascript", "application/javascript"]),
  code("jsx", "JSX", ["jsx"]),
  code("python", "Python", ["py", "pyw", "pyi", "pyx"]),
  code("rust", "Rust", ["rs"]),
  code("go", "Go", ["go"]),
  code("java", "Java", ["java"]),
  code("kotlin", "Kotlin", ["kt", "kts"]),
  code("swift", "Swift", ["swift"]),
  code("c", "C", ["c", "h"]),
  code("cpp", "C++", ["cpp", "cc", "cxx", "hpp", "hh", "hxx", "ino"]),
  code("csharp", "C#", ["cs", "csx"]),
  code("fsharp", "F#", ["fs", "fsx", "fsi"]),
  code("objective-c", "Objective-C", ["m", "mm"]),
  code("php", "PHP", ["php", "phtml"]),
  code("ruby", "Ruby", ["rb", "rake", "gemspec", "ru"]),
  code("perl", "Perl", ["pl", "pm"]),
  code("lua", "Lua", ["lua"]),
  code("r", "R", ["r", "rmd"]),
  code("julia", "Julia", ["jl"]),
  code("dart", "Dart", ["dart"]),
  code("scala", "Scala", ["scala", "sc"]),
  code("haskell", "Haskell", ["hs", "lhs"]),
  code("elixir", "Elixir", ["ex", "exs"]),
  code("erlang", "Erlang", ["erl", "hrl"]),
  code("clojure", "Clojure", ["clj", "cljs", "cljc", "edn"]),
  code("ocaml", "OCaml", ["ml", "mli"]),
  code("zig", "Zig", ["zig"]),
  code("nim", "Nim", ["nim"]),
  code("v", "V", ["vv"]),
  code("solidity", "Solidity", ["sol"]),
  code("shellscript", "Shell", ["sh", "bash", "zsh", "fish", "ksh", "bashrc", "zshrc", "profile"], "shellscript"),
  code("powershell", "PowerShell", ["ps1", "psm1", "psd1"]),
  code("bat", "Batch", ["bat", "cmd"]),
  code("css", "CSS", ["css"], "css", ["text/css"]),
  code("scss", "SCSS", ["scss", "sass"]),
  code("less", "Less", ["less"]),
  code("vue", "Vue", ["vue"]),
  code("svelte", "Svelte", ["svelte"]),
  code("astro", "Astro", ["astro"]),
  code("latex", "LaTeX", ["tex", "latex", "sty", "cls", "bib"]),
  code("dockerfile", "Dockerfile", ["dockerfile", "containerfile"], "docker"),
  code("make", "Makefile", ["mk", "makefile"]),
  code("cmake", "CMake", ["cmake"]),
  code("nix", "Nix", ["nix"]),
  code("hcl", "HCL", ["tf", "tfvars", "hcl"]),
  code("diff", "Diff", ["diff", "patch"]),
  code("glsl", "GLSL", ["glsl", "vert", "frag", "wgsl"]),
  code("asm", "Assembly", ["asm", "s"]),
  code("vb", "Visual Basic", ["vb", "vbs", "bas"]),
  code("groovy", "Groovy", ["groovy", "gradle"]),
  code("matlab", "MATLAB", ["matlab"]),
  code("fortran-free-form", "Fortran", ["f90", "f95", "f03", "f"]),
  code("pascal", "Pascal", ["pas", "pp"]),
  code("cobol", "COBOL", ["cob", "cbl"]),
  code("lisp", "Lisp", ["lisp", "el", "scm", "rkt"]),
  code("mermaid", "Mermaid", ["mmd", "mermaid"]),
  code("regexp", "Regex", ["regex"]),
];

/** Filenames that carry no extension but are well known. */
const NAMED: Record<string, string> = {
  dockerfile: "dockerfile",
  containerfile: "dockerfile",
  makefile: "make",
  gnumakefile: "make",
  rakefile: "ruby",
  gemfile: "ruby",
  podfile: "ruby",
  brewfile: "ruby",
  vagrantfile: "ruby",
  justfile: "make",
  procfile: "yaml",
  "cmakelists.txt": "cmake",
  ".gitignore": "ini",
  ".dockerignore": "ini",
  ".gitattributes": "ini",
  ".env": "ini",
  license: "text",
  readme: "text",
  changelog: "text",
  authors: "text",
};

const BY_ID = new Map(FORMATS.map((format) => [format.id, format]));
const BY_EXTENSION = new Map<string, Format>();
const BY_MIME = new Map<string, Format>();
for (const format of FORMATS) {
  for (const extension of format.extensions) {
    if (!BY_EXTENSION.has(extension)) BY_EXTENSION.set(extension, format);
  }
  for (const mime of format.mimes ?? []) BY_MIME.set(mime, format);
}

export const TEXT_FORMAT = BY_ID.get("text")!;
export const BINARY_FORMAT: Format = {
  id: "binary",
  label: "Binary",
  family: "code",
  viewer: "hex",
  extensions: [],
};

export function formatById(id: string): Format {
  return BY_ID.get(id) ?? (id === BINARY_FORMAT.id ? BINARY_FORMAT : TEXT_FORMAT);
}

export function extensionOf(name: string): string {
  const base = name.split("/").pop() ?? name;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function formatByName(name: string): Format | undefined {
  const base = (name.split("/").pop() ?? name).toLowerCase();
  const named = NAMED[base];
  if (named) return BY_ID.get(named);
  if (base.startsWith(".env")) return BY_ID.get("ini");
  // `foo.tar.gz` reads as a tarball, `foo.d.ts` as TypeScript: the last
  // extension wins, which is right for both.
  return BY_EXTENSION.get(extensionOf(base));
}

export function formatByMime(mime: string): Format | undefined {
  if (!mime) return undefined;
  const exact = BY_MIME.get(mime);
  if (exact) return exact;
  if (mime.startsWith("image/")) return BY_ID.get("image");
  if (mime.startsWith("video/")) return BY_ID.get("video");
  if (mime.startsWith("audio/")) return BY_ID.get("audio");
  if (mime.startsWith("font/")) return BY_ID.get("font");
  if (mime.startsWith("text/")) return TEXT_FORMAT;
  if (mime.endsWith("+json")) return BY_ID.get("json");
  if (mime.endsWith("+xml")) return BY_ID.get("xml");
  return undefined;
}

export const FAMILIES: Array<{ id: Family; name: string; blurb: string; highlights: string[] }> = [
  { id: "documents", name: "Documents", blurb: "Read, search and page through", highlights: ["PDF", "Word", "PowerPoint", "EPUB", "Markdown", "RTF", "Email", "HTML"] },
  { id: "data", name: "Data", blurb: "Browse tables, trees and databases", highlights: ["Excel", "Numbers", "ODS", "CSV", "JSON", "SQLite", "Parquet", "Jupyter"] },
  { id: "images", name: "Images", blurb: "Zoom, pan and flip through", highlights: ["JPG", "PNG", "HEIC", "WebP", "AVIF", "GIF", "SVG", "TIFF", "PSD"] },
  { id: "media", name: "Audio & video", blurb: "Play at any speed", highlights: ["MP4", "MOV", "WebM", "MKV", "MP3", "FLAC", "WAV", "M4A"] },
  { id: "code", name: "Code & text", blurb: "Highlighted, in 200+ languages", highlights: ["TypeScript", "Python", "Rust", "Go", "Swift", "C++", "YAML", "Logs"] },
  { id: "archives", name: "Archives", blurb: "Look inside without unpacking", highlights: ["ZIP", "RAR", "7z", "TAR", "GZ", "CBZ", "APK", "ISO"] },
  { id: "3d", name: "3D models", blurb: "Orbit, zoom and inspect", highlights: ["GLB", "glTF", "STL", "OBJ", "FBX", "PLY", "3MF", "USDZ"] },
  { id: "fonts", name: "Fonts", blurb: "Specimens and every glyph", highlights: ["TTF", "OTF", "WOFF", "WOFF2", "TTC"] },
];

export function extensionsFor(family: Family): string[] {
  return FORMATS.filter((format) => format.family === family).flatMap(
    (format) => format.extensions,
  );
}

/**
 * The picker accepts everything: anything textual opens as text, and anything
 * else opens in the hex view, so there is no file the reader refuses.
 */
export const ACCEPT_ANY = "*/*";

export function acceptFor(family: Family): string {
  return extensionsFor(family)
    .map((extension) => `.${extension}`)
    .join(",");
}
