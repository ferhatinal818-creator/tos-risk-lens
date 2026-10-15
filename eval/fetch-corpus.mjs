// Gerçek ToS/gizlilik metinlerini Open Terms Archive (PGA v2) deposundan, SABİT bir commit'ten indirir.
// Metinler telifli olduğu için depoya konmaz (eval/corpus/ .gitignore'da); bu betik yeniden üretilebilirlik sağlar.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const SHA = '30e87e953483dd0348ac676e8a2e66dca46b42fe';
export const DOCS = [
  { id: 'mastodon-tos', file: 'Mastodon/Terms of Service.md', title: 'Mastodon — Terms of Service' },
  { id: 'bereal-tos', file: 'BeReal/Terms of Service.md', title: 'BeReal — Terms of Service' },
  { id: 'pinterest-tos', file: 'Pinterest/Terms of Service.md', title: 'Pinterest — Terms of Service' },
  { id: 'instagram-tos', file: 'Instagram/Terms of Service.md', title: 'Instagram — Terms of Use' },
  { id: 'spotify-tos', file: 'Spotify/Terms of Service.md', title: 'Spotify — Terms of Use' },
  { id: 'snapchat-privacy', file: 'Snapchat/Privacy Policy.md', title: 'Snapchat — Privacy Policy' },
];

// Markdown -> düz metin (tarayıcıdan yakalanan metne yakın görünüm)
export function mdToText(md) {
  return md
    .replace(/\r/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\((?:[^)(]|\([^)]*\))*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:]|$)/gm, '$1$2')
    .replace(/^\s*(?:-{3,}|={3,})\s*$/gm, '')
    .replace(/\\([*_#\-.()\[\]!])/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}

const here = path.dirname(fileURLToPath(import.meta.url));
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = path.join(here, 'corpus');
  await mkdir(dir, { recursive: true });
  for (const d of DOCS) {
    const url = `https://raw.githubusercontent.com/OpenTermsArchive/pga-versions/${SHA}/${d.file.split('/').map(encodeURIComponent).join('/')}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${d.id}: HTTP ${res.status} ${url}`);
    const text = mdToText(await res.text());
    await writeFile(path.join(dir, `${d.id}.txt`), text);
    console.log(d.id.padEnd(18), String(text.length).padStart(7), 'chars');
  }
}
