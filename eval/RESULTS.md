# Mini eval sonuçları

> Bu dosya `node eval/report.mjs` ile `eval/results/*.json` dosyalarından üretilir. Sayılar elle yazılmamıştır.

## Kurulum (ve sınırları)

- **Veri:** 6 gerçek metin — 5 kullanım koşulları (Mastodon, BeReal, Pinterest, Instagram, Spotify) + 1 gizlilik politikası (Snapchat). Kaynak: Open Terms Archive / Platform Governance Archive, `OpenTermsArchive/pga-versions` deposu, sabit commit `30e87e953483dd0348ac676e8a2e66dca46b42fe`. İndirme: `npm run corpus` (telif nedeniyle metinler depoya konmaz).
- **Altın etiket:** 132 etiket (`eval/gold.json`): **must** (60) = yakalanması beklenen belirgin riskli madde; **borderline** (67) = dengeli/standart, yakalanırsa da kaçırılırsa da cezasız; **trap** (5) = olumsuzlama/koruyucu cümle ("verilerinizi satmıyoruz") — aynı kategoride bulgu üretmek tuzağa düşmektir.
- **Eşleşme:** bulgu, aynı kategoride ve altın alıntının ±150 karakter çevresiyle kesişiyorsa eşleşir. Her altın alıntının korpusta birebir bulunduğu `eval/verify-gold.mjs` ile doğrulanır.
- **Ölçülen sistem:** üretimdeki hat (temizle → parçala → model → **doğrula** → tekilleştir). "LLM" satırlarındaki model: Claude (Sonnet), `src/core/prompt.js` istemiyle, parça başına **körlemesine** (altın etiketleri görmeden) yanıtlattı; ham çıktılar doğrulayıcıdan geçirildi. Bu bir API çağrısı değil, aynı istemin bir alt-ajana verilmesidir; uzantının `llm.js` istemcisi bu ölçümde **çalışmadı** (birim ve tarayıcı testlerinde sahte uç noktayla çalıştı). Kendi anahtarınızla yeniden ölçmek için: `npm run eval:prepare && npm run eval:live && npm run eval:llm`.
- **Önemli yanlılık uyarıları:** (1) Etiketleri yazan ve ölçülen model aynı model ailesidir; korelasyonlu yargılar recall'u şişirmiş olabilir. (2) Tek anotatör, kişi-arası uyum ölçülmedi. (3) Belgeler İngilizce; Türkçe için gerçek ToS eval'i **yok** (Türkçe yalnızca kurgusal demo fixture'ında ve kural desenlerinde denendi). (4) 6 belge küçük bir örneklem; yüzdelerin güven aralığı geniştir.

## Özet

| Ölçü | Yalnızca kurallar (LLM yok) | LLM + doğrulayıcı |
|---|---|---|
| **Recall (must), katı** | 41.7% (25/60) | **88.3%** (53/60) |
| Recall (must), yalnızca konum | 50% | 95% |
| **Precision, katı** (bulgunun must/borderline ile eşleşmesi) | 53.3% (48/90) | **67.1%** (104/155) |
| Borderline kapsama | 19.4% | 77.6% |
| **Tuzağa düşme** (düşük iyi) | 60% (3/5) | **40%** (2/5) |
| Doğrulayıcının reddettiği model iddiası | — | 0/167 |

**Sonradan yapılmış öznel denetim:** LLM'in 51 "yanlış alarmı" tek tek okundu (`eval/audit.json`): **34** tanesi makul bir inceleyicinin de tüketici aleyhine sayacağı madde (altın etiketim eksikti ya da kategori uyuşmadı), **17** tanesi gerçekten nötr/koruyucu ifade. Denetimli precision: **89%** (138/155). Bu sayıyı başlık olarak kullanmıyorum: model çıktıları görüldükten sonra, aynı kişi tarafından verildi.

## Belge bazında (LLM + doğrulayıcı)

| Belge | must yakalanan | borderline | bulgu | TP | FP | tuzak | skor |
|---|---|---|---|---|---|---|---|
| mastodon-tos | 6/6 | 6/8 | 16 | 12 | 4 | 0/0 | 88 |
| bereal-tos | 8/8 | 4/6 | 14 | 13 | 1 | 0/0 | 85 |
| pinterest-tos | 10/11 | 10/11 | 29 | 19 | 10 | 0/0 | 98 |
| instagram-tos | 3/5 | 12/13 | 26 | 16 | 10 | 0/2 | 87 |
| spotify-tos | 15/17 | 14/16 | 47 | 27 | 20 | 0/0 | 100 |
| snapchat-privacy | 11/13 | 6/13 | 23 | 17 | 6 | 2/3 | 94 |

## Kaçırılan maddeler (LLM)

- **pinterest-tos · P11** (`liability_limitation`) — *hiç bulgu yok*: “we shall not be liable for any indirect, incidental, special, consequential or punitive damages, or any loss of profits or revenues”
- **instagram-tos · I4** (`content_license`) — *aynı yerde bulgu var, ama yanlış kategoride*: “can be used next to or in connection with accounts, ads (if we show you ads on Meta Products), offers, and other sponsored content that you follow or…”
- **instagram-tos · I5** (`liability_limitation`) — *hiç bulgu yok*: “Without limiting any of the above, we shall be liable for slight negligence only in the case of violation of an "essential" obligation under this agr…”
- **spotify-tos · S8** (`liability_limitation`) — *aynı yerde bulgu var, ama yanlış kategoride*: “ANY CLAIM ARISING UNDER THESE TERMS MUST BE COMMENCED (BY FILING A DEMAND OR FILING AN INDIVIDUAL ACTION AS SPECIFIED UNDER THE ARBITRATION AGREEMENT…”
- **spotify-tos · S17** (`other_risk`) — *aynı yerde bulgu var, ama yanlış kategoride*: “to allow the Spotify Service to use the processor, bandwidth, and storage hardware on your Device in order to facilitate the operation of the Spotify…”
- **snapchat-privacy · SN3** (`data_collection_tracking`) — *hiç bulgu yok*: “infer your age or interests based on your content or activity”
- **snapchat-privacy · SN10** (`data_sharing`) — *aynı yerde bulgu var, ama yanlış kategoride*: “Your information may be provided to the integrated partner through these integrations, as well as to Snap. We are not responsible for how those partn…”

## Tuzağa düşülen yerler (LLM)

- **snapchat-privacy · SNt1**: “We do not share private content and communications with our service providers to use for their own purposes.”
- **snapchat-privacy · SNt2**: “We do not use the private content and communications you send to people who are your friends to personalise your experience, make recommendations or …”

## Yanlış alarmlar (LLM) ve denetim hükmü

| Belge | Kategori | Hüküm | Alıntı |
|---|---|---|---|
| mastodon-tos | `account_termination` | savunulabilir | You may no longer use the forum if the company contacts you directly to say that you may not. |
| mastodon-tos | `other_risk` | savunulabilir | You agree to be responsible for all action taken using your account, whether authorized by you or not, until you either close your account or notify … |
| mastodon-tos | `unilateral_change` | yanlış alarm | The company may notify you under these terms using the e-mail address you provide for your account on the forum, or by posting a message to the homep… |
| mastodon-tos | `unilateral_change` | yanlış alarm | The company last updated these terms on [INSERT LAST UPDATE DATE HERE], and may update these terms again. |
| bereal-tos | `consent_by_use` | savunulabilir | If you continue to use our services after the effective date, you accept the updated user agreement. |
| pinterest-tos | `liability_limitation` | yanlış alarm | we are not responsible for or liable to any third party for the content or accuracy of any User Content posted by you or any other Pinterest user |
| pinterest-tos | `other_risk` | savunulabilir | Nothing in these Terms: (i) entitles you to any payment or the right to share in any revenue from any monetisation of User Content |
| pinterest-tos | `account_termination` | savunulabilir | We reserve the right to refuse Service to anyone and will provide notice of termination where appropriate. |
| pinterest-tos | `unilateral_change` | savunulabilir | We may make changes to Pinterest for various reasons. We will have no liability for any change to Pinterest or any suspension or termination of your … |
| pinterest-tos | `other_risk` | savunulabilir | a Notice of Dispute that asserts the rights of more than one party is ineffective |
| pinterest-tos | `jurisdiction` | yanlış alarm | you agree that the US Federal Arbitration Act governs the interpretation and enforcement of this Section |
| pinterest-tos | `arbitration_class_waiver` | savunulabilir | you and Pinterest are each waiving the right to a trial by jury or to participate in a class action |
| pinterest-tos | `arbitration_class_waiver` | savunulabilir | if 25 or more similar arbitration demands are filed within a 60-day period or with the assistance of the same law firm or group of law firms, AAA wil… |
| pinterest-tos | `consent_by_use` | savunulabilir | Your continued access to or use of Pinterest after such an update constitutes your binding acceptance of such changes. |
| pinterest-tos | `data_sharing` | yanlış alarm | you agree that any rights and licences granted hereunder benefit Pinterest, Inc. and all of its worldwide subsidiaries and affiliates |
| instagram-tos | `account_termination` | savunulabilir | we may suspend access to Instagram where we determine that you have frequently provided manifestly illegal content |
| instagram-tos | `data_collection_tracking` | savunulabilir | We use all the information we have-including your information-to try to keep our platform secure. |
| instagram-tos | `data_collection_tracking` | yanlış alarm | Providing our Service requires collecting and using your information. |
| instagram-tos | `other_risk` | savunulabilir | Your username, profile picture, and information about your actions (such as likes) or relationships (such as follows) can be used next to or in conne… |
| instagram-tos | `account_termination` | yanlış alarm | We can remove or restrict any content you share on the Service if it violates these Terms of Use or our policies |
| instagram-tos | `data_retention` | yanlış alarm | the content will be retained for no longer than is necessary for the purposes for which it has been retained (the exact duration will vary on a case-… |
| instagram-tos | `other_risk` | yanlış alarm | If any of those terms conflict with this agreement, those other terms will govern. |
| instagram-tos | `liability_limitation` | savunulabilir | in other cases, there is no liability for slight negligence |
| instagram-tos | `unilateral_change` | yanlış alarm | We may change our Service and policies, and we may need to make changes to these Terms so that they accurately reflect our Service and policies. |
| instagram-tos | `consent_by_use` | savunulabilir | Then, if you continue to access or use the Service you will be bound by the updated Terms. |
| spotify-tos | `unilateral_change` | savunulabilir | Spotify or the applicable owners may remove access to particular songs, videos, podcasts, audiobooks and other Content without notice. |
| spotify-tos | `no_refund` | savunulabilir | Spotify has no liability to you, nor any obligation to provide a refund to you, in connection with internet or other Spotify Service outages or failu… |
| spotify-tos | `consent_by_use` | savunulabilir | by continuing to use the Spotify Service after the price change takes effect, you will have accepted the new price |
| spotify-tos | `fee_change` | yanlış alarm | Any change in tax rate will be automatically applied based on the account information you provide. |
| spotify-tos | `liability_limitation` | savunulabilir | Spotify is not responsible for what you or others post or share on the Spotify Service. |
| spotify-tos | `content_license` | savunulabilir | such Feedback is not confidential and may be used by Spotify without restriction and without payment to you. |
| spotify-tos | `data_collection_tracking` | savunulabilir | to allow the Spotify Service to use the processor, bandwidth, and storage hardware on your Device in order to facilitate the operation of the Spotify… |
| spotify-tos | `data_sharing` | savunulabilir | (2) to provide advertising and other information to you, and (3) to allow our business partners to do the same. |
| spotify-tos | `other_risk` | savunulabilir | ANY CLAIM ARISING UNDER THESE TERMS MUST BE COMMENCED (BY FILING A DEMAND OR FILING AN INDIVIDUAL ACTION AS SPECIFIED UNDER THE ARBITRATION AGREEMENT… |
| spotify-tos | `other_risk` | yanlış alarm | the owners of the Content and certain distributors (such as app store providers) are intended beneficiaries of these Terms and have the right to enfo… |
| spotify-tos | `arbitration_class_waiver` | savunulabilir | THERE IS NO JUDGE OR JURY IN ARBITRATION, AND COURT REVIEW OF AN ARBITRATION AWARD IS LIMITED. |
| spotify-tos | `jurisdiction` | savunulabilir | shall be brought in the federal courts of New York, New York |
| spotify-tos | `other_risk` | yanlış alarm | set forth the alleged damage and harm suffered and the specific relief sought with a calculation for it. |
| spotify-tos | `other_risk` | yanlış alarm | the parties agree to engage in good faith for a period of sixty (60) days in an effort to resolve the Dispute |
| spotify-tos | `jurisdiction` | savunulabilir | in the federal or state courts of New York, New York |
| spotify-tos | `arbitration_class_waiver` | savunulabilir | each party may bring a Dispute against the other party only in an individual capacity and not participate as a plaintiff, claimant, or class member i… |
| spotify-tos | `unilateral_change` | savunulabilir | We may make changes to these Terms (including any additional Spotify terms and conditions incorporated by reference herein) from time to time by noti… |
| spotify-tos | `consent_by_use` | savunulabilir | Your use of the Spotify Service following any changes to these Terms will constitute your acceptance of such changes. |
| spotify-tos | `other_risk` | yanlış alarm | Such an opt-out must be sent by you personally from your personal email address, and not by your agent, attorney, or anyone else purporting to act on… |
| spotify-tos | `arbitration_class_waiver` | savunulabilir | Even if you opt out of a material change to the Arbitration Agreement, you and Spotify agree that any Dispute will be determined by binding individua… |
| snapchat-privacy | `data_collection_tracking` | yanlış alarm | we process your information to provide you a more personalised experience, including to show you content and information that is most relevant to you… |
| snapchat-privacy | `data_collection_tracking` | savunulabilir | we may use information about faces in your Memories to improve search, organisation and personalisation in Memories |
| snapchat-privacy | `ai_training_use` | savunulabilir | we also develop and improve the algorithms and machine learning models |
| snapchat-privacy | `liability_limitation` | savunulabilir | We are not responsible for how those partners collect or use your information. |
| snapchat-privacy | `other_risk` | savunulabilir | we may collect your personal information from, transfer it to and store and process it in the United States or other countries outside where you live. |
| snapchat-privacy | `data_collection_tracking` | yanlış alarm | We may use age-assurance measures, including automated tools, to help determine whether users meet minimum age requirements or should receive age-app… |

## Doğrulayıcı stres testi

Gerçek model çıktısında doğrulayıcı hiçbir iddiayı reddetmedi (0/167): model alıntıları birebir kopyaladı. Bu yüzden doğrulayıcının değeri bu ölçümde **görünmez**. Değerini ölçmek için kabul edilen gerçek bulguların alıntıları 5 yolla bozuldu (kelime değiştirme, eş anlamlı yeniden yazma, uydurma cümle ekleme, yarıda kesip uydurma devam, Türkçeye çevirme):

| Bozma yöntemi | Denenen | Reddedilen |
|---|---|---|
| kelime_degistir | 116 | 116 |
| es_anlamli_yeniden_yaz | 89 | 89 |
| iki_cumleyi_birlestir | 116 | 116 |
| sonu_kes_uydur | 116 | 116 |
| turkceye_cevir | 116 | 116 |
| **Toplam** | **553** | **553** |

Not: bu, doğrulayıcının *uydurma alıntıyı* yakaladığını gösterir; modelin *doğru alıntıyla yanlış yorum* yapmasını (alıntı gerçek, kategori/şiddet yanlış) yakalamaz. O hata türü yukarıdaki precision/yanlış alarm satırlarında görünür.

## Kural motoru (LLM'siz taban çizgisi) — belge bazında

| Belge | must | borderline | bulgu | TP | FP | tuzak |
|---|---|---|---|---|---|---|
| mastodon-tos | 3/6 | 1/8 | 7 | 4 | 3 | 0/0 |
| bereal-tos | 4/8 | 1/6 | 10 | 7 | 3 | 0/0 |
| pinterest-tos | 7/11 | 1/11 | 17 | 11 | 6 | 0/0 |
| instagram-tos | 1/5 | 0/13 | 4 | 1 | 3 | 2/2 |
| spotify-tos | 8/17 | 6/16 | 42 | 19 | 23 | 0/0 |
| snapchat-privacy | 2/13 | 4/13 | 10 | 6 | 4 | 1/3 |

Kural motoru ürünün skoruna **girmez**; yalnızca (a) model kaçırırsa/susturulursa "doğrulanmamış işaret" olarak gösterir, (b) bu tabloda LLM'siz taban çizgisidir.

## Okuma

1. **LLM, kuralların çok üstünde recall veriyor** (88.3% vs 41.7%), ama katı precision 67.1% ile kusursuz değil; yanlış alarmların önemli kısmı 34/51 oranında "savunulabilir" çıktı, yani en azından bir kısmı ölçüm etiketlerimin boşluğu.
2. **Tuzaklar en zayıf nokta**: LLM 2/5 tuzağa düştü, kurallar 3/5. Olumsuzlama ("satmıyoruz", "paylaşmıyoruz") cümleleri hâlâ riskli madde diye işaretlenebiliyor. Alıntı doğrulaması bunu *engelleyemez* (alıntı gerçek), yalnızca şiddet/güven ile görünür kılınır.
3. **Kaçırılanların çoğu** ince/dolaylı maddeler: çıkarım yoluyla profilleme (Snapchat), "zararı yalnızca temel yükümlülük ihlalinde" gibi dolambaçlı sorumluluk sınırları (Instagram), kısa süreli dava zamanaşımı (Spotify). Bunlar kategori tablosunun da net karşılamadığı yerler.
4. **Skor kalibrasyonu doğrulanmadı.** Skor sabit bir formüldür; "gerçek risk" ile korelasyonu bu eval'de ölçülmedi.
