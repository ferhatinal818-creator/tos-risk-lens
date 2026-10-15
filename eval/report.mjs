// eval/results/*.json -> eval/RESULTS.md (sayılar koddan gelir; yorumlar sayılara atıf yapar).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rd = (f) => JSON.parse(readFileSync(path.join(here, f), 'utf8'));
const rules = rd('results/rules.json');
const llm = rd('results/llm-claude-sonnet.json');
const stress = existsSync(path.join(here, 'results/verifier-stress.json')) ? rd('results/verifier-stress.json') : null;
const audit = rd('audit.json').verdicts;
const gold = rd('gold.json');
const pct = (n, d) => (d ? `${Math.round((1000 * n) / d) / 10}%` : '—');

// ---- denetim: her LLM yanlış alarmına hüküm
let aud = { defensible: 0, false_alarm: 0, unaudited: [] };
const verdictOf = (doc, quote) => (audit[doc] || []).find(([k]) => quote.includes(k))?.[1];
for (const [doc, p] of Object.entries(llm.perDoc)) for (const fa of p.falseAlarms) {
  const v = verdictOf(doc, fa.quote);
  fa.verdict = v || 'unaudited';
  if (v) aud[v]++; else aud.unaudited.push(`${doc}: ${fa.quote.slice(0, 60)}`);
}
if (aud.unaudited.length) { console.error('DENETİMSİZ yanlış alarm var:\n' + aud.unaudited.join('\n')); process.exit(1); }

const L = llm.summary, R = rules.summary;
const tpAdj = L.tp + aud.defensible;
const out = [];
const w = (s = '') => out.push(s);

w('# Mini eval sonuçları');
w();
w('> Bu dosya `node eval/report.mjs` ile `eval/results/*.json` dosyalarından üretilir. Sayılar elle yazılmamıştır.');
w();
w('## Kurulum (ve sınırları)');
w();
w(`- **Veri:** 6 gerçek metin — 5 kullanım koşulları (Mastodon, BeReal, Pinterest, Instagram, Spotify) + 1 gizlilik politikası (Snapchat). Kaynak: Open Terms Archive / Platform Governance Archive, \`OpenTermsArchive/pga-versions\` deposu, sabit commit \`30e87e953483dd0348ac676e8a2e66dca46b42fe\`. İndirme: \`npm run corpus\` (telif nedeniyle metinler depoya konmaz).`);
w(`- **Altın etiket:** ${Object.values(gold.docs).reduce((n, d) => n + d.must.length + d.borderline.length + d.traps.length, 0)} etiket (\`eval/gold.json\`): **must** (${L.must}) = yakalanması beklenen belirgin riskli madde; **borderline** (${L.border}) = dengeli/standart, yakalanırsa da kaçırılırsa da cezasız; **trap** (${L.traps}) = olumsuzlama/koruyucu cümle ("verilerinizi satmıyoruz") — aynı kategoride bulgu üretmek tuzağa düşmektir.`);
w('- **Eşleşme:** bulgu, aynı kategoride ve altın alıntının ±150 karakter çevresiyle kesişiyorsa eşleşir. Her altın alıntının korpusta birebir bulunduğu `eval/verify-gold.mjs` ile doğrulanır.');
w('- **Ölçülen sistem:** üretimdeki hat (temizle → parçala → model → **doğrula** → tekilleştir). "LLM" satırlarındaki model: Claude (Sonnet), `src/core/prompt.js` istemiyle, parça başına **körlemesine** (altın etiketleri görmeden) yanıtlattı; ham çıktılar doğrulayıcıdan geçirildi. Bu bir API çağrısı değil, aynı istemin bir alt-ajana verilmesidir; uzantının `llm.js` istemcisi bu ölçümde **çalışmadı** (birim ve tarayıcı testlerinde sahte uç noktayla çalıştı). Kendi anahtarınızla yeniden ölçmek için: `npm run eval:prepare && npm run eval:live && npm run eval:llm`.');
w('- **Önemli yanlılık uyarıları:** (1) Etiketleri yazan ve ölçülen model aynı model ailesidir; korelasyonlu yargılar recall\'u şişirmiş olabilir. (2) Tek anotatör, kişi-arası uyum ölçülmedi. (3) Belgeler İngilizce; Türkçe için gerçek ToS eval\'i **yok** (Türkçe yalnızca kurgusal demo fixture\'ında ve kural desenlerinde denendi). (4) 6 belge küçük bir örneklem; yüzdelerin güven aralığı geniştir.');
w();
w('## Özet');
w();
w('| Ölçü | Yalnızca kurallar (LLM yok) | LLM + doğrulayıcı |');
w('|---|---|---|');
w(`| **Recall (must), katı** | ${R.recall_must}% (${R.mustCaught}/${R.must}) | **${L.recall_must}%** (${L.mustCaught}/${L.must}) |`);
w(`| Recall (must), yalnızca konum | ${R.recall_must_location_only}% | ${L.recall_must_location_only}% |`);
w(`| **Precision, katı** (bulgunun must/borderline ile eşleşmesi) | ${R.precision}% (${R.tp}/${R.findings}) | **${L.precision}%** (${L.tp}/${L.findings}) |`);
w(`| Borderline kapsama | ${R.borderline_coverage}% | ${L.borderline_coverage}% |`);
w(`| **Tuzağa düşme** (düşük iyi) | ${R.trap_rate}% (${R.trapHits}/${R.traps}) | **${L.trap_rate}%** (${L.trapHits}/${L.traps}) |`);
w(`| Doğrulayıcının reddettiği model iddiası | — | ${L.rejected}/${L.claimed} |`);
w();
w(`**Sonradan yapılmış öznel denetim:** LLM'in ${L.fp} "yanlış alarmı" tek tek okundu (\`eval/audit.json\`): **${aud.defensible}** tanesi makul bir inceleyicinin de tüketici aleyhine sayacağı madde (altın etiketim eksikti ya da kategori uyuşmadı), **${aud.false_alarm}** tanesi gerçekten nötr/koruyucu ifade. Denetimli precision: **${pct(tpAdj, L.findings)}** (${tpAdj}/${L.findings}). Bu sayıyı başlık olarak kullanmıyorum: model çıktıları görüldükten sonra, aynı kişi tarafından verildi.`);
w();
w('## Belge bazında (LLM + doğrulayıcı)');
w();
w('| Belge | must yakalanan | borderline | bulgu | TP | FP | tuzak | skor |');
w('|---|---|---|---|---|---|---|---|');
for (const [id, p] of Object.entries(llm.perDoc)) w(`| ${id} | ${p.mustCaught}/${p.must} | ${p.borderCaught}/${p.borderline} | ${p.findings} | ${p.truePos} | ${p.falsePos} | ${p.trapHits}/${p.traps} | ${p.score} |`);
w();
w('## Kaçırılan maddeler (LLM)');
w();
for (const [id, p] of Object.entries(llm.perDoc)) for (const m of p.missed) w(`- **${id} · ${m.id}** (\`${m.category}\`)${m.wrongCategoryNearby ? ' — *aynı yerde bulgu var, ama yanlış kategoride*' : ' — *hiç bulgu yok*'}: “${m.quote}”`);
w();
w('## Tuzağa düşülen yerler (LLM)');
w();
const traps = Object.entries(llm.perDoc).flatMap(([id, p]) => p.trapsFallenFor.map((t) => `- **${id} · ${t.id}**: “${t.quote}”`));
w(traps.length ? traps.join('\n') : '_Yok._');
w();
w('## Yanlış alarmlar (LLM) ve denetim hükmü');
w();
w('| Belge | Kategori | Hüküm | Alıntı |');
w('|---|---|---|---|');
for (const [id, p] of Object.entries(llm.perDoc)) for (const f of p.falseAlarms) w(`| ${id} | \`${f.category}\` | ${f.verdict === 'defensible' ? 'savunulabilir' : 'yanlış alarm'}${f.nearTrap ? ' · tuzak' : ''} | ${f.quote.replace(/\|/g, '\\|')} |`);
w();
w('## Doğrulayıcı stres testi');
w();
if (stress) {
  w(`Gerçek model çıktısında doğrulayıcı hiçbir iddiayı reddetmedi (${L.rejected}/${L.claimed}): model alıntıları birebir kopyaladı. Bu yüzden doğrulayıcının değeri bu ölçümde **görünmez**. Değerini ölçmek için kabul edilen gerçek bulguların alıntıları 5 yolla bozuldu (kelime değiştirme, eş anlamlı yeniden yazma, uydurma cümle ekleme, yarıda kesip uydurma devam, Türkçeye çevirme):`);
  w();
  w('| Bozma yöntemi | Denenen | Reddedilen |');
  w('|---|---|---|');
  for (const [k, s] of Object.entries(stress.stats)) w(`| ${k} | ${s.tried} | ${s.rejected} |`);
  w(`| **Toplam** | **${stress.total.tried}** | **${stress.total.rejected}** |`);
  w();
  w('Not: bu, doğrulayıcının *uydurma alıntıyı* yakaladığını gösterir; modelin *doğru alıntıyla yanlış yorum* yapmasını (alıntı gerçek, kategori/şiddet yanlış) yakalamaz. O hata türü yukarıdaki precision/yanlış alarm satırlarında görünür.');
}
w();
w('## Kural motoru (LLM\'siz taban çizgisi) — belge bazında');
w();
w('| Belge | must | borderline | bulgu | TP | FP | tuzak |');
w('|---|---|---|---|---|---|---|');
for (const [id, p] of Object.entries(rules.perDoc)) w(`| ${id} | ${p.mustCaught}/${p.must} | ${p.borderCaught}/${p.borderline} | ${p.findings} | ${p.truePos} | ${p.falsePos} | ${p.trapHits}/${p.traps} |`);
w();
w('Kural motoru ürünün skoruna **girmez**; yalnızca (a) model kaçırırsa/susturulursa "doğrulanmamış işaret" olarak gösterir, (b) bu tabloda LLM\'siz taban çizgisidir.');
w();
w('## Okuma');
w();
w(`1. **LLM, kuralların çok üstünde recall veriyor** (${L.recall_must}% vs ${R.recall_must}%), ama katı precision ${L.precision}% ile kusursuz değil; yanlış alarmların önemli kısmı ${aud.defensible}/${L.fp} oranında "savunulabilir" çıktı, yani en azından bir kısmı ölçüm etiketlerimin boşluğu.`);
w(`2. **Tuzaklar en zayıf nokta**: LLM ${L.trapHits}/${L.traps} tuzağa düştü, kurallar ${R.trapHits}/${R.traps}. Olumsuzlama ("satmıyoruz", "paylaşmıyoruz") cümleleri hâlâ riskli madde diye işaretlenebiliyor. Alıntı doğrulaması bunu *engelleyemez* (alıntı gerçek), yalnızca şiddet/güven ile görünür kılınır.`);
w('3. **Kaçırılanların çoğu** ince/dolaylı maddeler: çıkarım yoluyla profilleme (Snapchat), "zararı yalnızca temel yükümlülük ihlalinde" gibi dolambaçlı sorumluluk sınırları (Instagram), kısa süreli dava zamanaşımı (Spotify). Bunlar kategori tablosunun da net karşılamadığı yerler.');
w('4. **Skor kalibrasyonu doğrulanmadı.** Skor sabit bir formüldür; "gerçek risk" ile korelasyonu bu eval\'de ölçülmedi.');
writeFileSync(path.join(here, 'RESULTS.md'), out.join('\n') + '\n');
console.log('eval/RESULTS.md yazıldı');
