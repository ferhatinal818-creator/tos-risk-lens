// Paragraf sınırlarına saygı gösteren, hafif örtüşmeli parçalama.
export function chunkText(text, { size = 12000, overlap = 600 } = {}) {
  if (text.length <= size) return [{ index: 0, start: 0, text }];
  const lines = [];
  let pos = 0;
  for (const raw of text.split('\n')) {
    // çok uzun tek satırları sert böl
    for (let i = 0; i < Math.max(1, raw.length); i += size) {
      const piece = raw.slice(i, i + size);
      lines.push({ s: pos + i, text: piece });
    }
    pos += raw.length + 1;
  }
  const chunks = [];
  let cur = [];
  let len = 0;
  const flush = () => {
    if (!cur.length) return;
    chunks.push({ index: chunks.length, start: cur[0].s, text: cur.map((l) => l.text).join('\n') });
  };
  for (const l of lines) {
    if (len + l.text.length + 1 > size && cur.length) {
      flush();
      // örtüşme: son satırlardan overlap kadarını taşı
      const keep = [];
      let k = 0;
      for (let i = cur.length - 1; i >= 0 && k < overlap; i--) { keep.unshift(cur[i]); k += cur[i].text.length + 1; }
      cur = keep;
      len = k;
    }
    cur.push(l);
    len += l.text.length + 1;
  }
  flush();
  return chunks;
}
