export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  // Firefox can start the download asynchronously. Keep the URL alive long
  // enough for it to consume the blob, including on slower devices.
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 30000);
}
