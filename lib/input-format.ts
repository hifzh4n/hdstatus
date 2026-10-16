export type SupportedContainer = {
  extension: "mp4" | "mov" | "m4v";
  mimeType: "video/mp4" | "video/quicktime";
};

export function identifySupportedContainer(file: Pick<File, "name" | "type">): SupportedContainer | null {
  const extension = file.name.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
  if (extension === "mov") return { extension: "mov", mimeType: "video/quicktime" };
  if (extension === "m4v") return { extension: "m4v", mimeType: "video/mp4" };
  if (extension === "mp4") return { extension: "mp4", mimeType: "video/mp4" };

  // Some iOS/browser pickers omit the filename extension but retain the MIME type.
  if (file.type === "video/quicktime") return { extension: "mov", mimeType: "video/quicktime" };
  if (file.type === "video/mp4") return { extension: "mp4", mimeType: "video/mp4" };
  return null;
}
