# TASK: Bygg ny Android-app i React Native för havsstrandsinventering

## Syfte
Detta dokument beskriver arbetet för att bygga om gamla appen till en ny app i React Native för Android.

Dokumentet är skrivet som ett arbetsunderlag för implementation och prioritering. Fokus är att bygga en modern, konfigurerbar och offline-tålig app där så lite som möjligt är hårdkodat i klienten.

## Produktmål
Den nya appen ska:
- byggas i React Native för Android
- vara helt på svenska
- använda telefonens GPS
- spara JSON-filer och foton i en användartillgänglig mapp på telefonen
- hämta grunddata från internet vid första uppstart
- styras så långt som möjligt av `basic_data` i JSON-format
- kunna visa nya inmatningsfält utan att appkod måste ändras
- få API-URL:er för data- och fotouppladdning via `basic_data`

## Grundkrav

### 1. Plattform
- Appen ska byggas för Android.
- React Native är klientplattformen.
- Appen ska stödja moderna Android-versioner och använda Androids vanliga filåtkomst och platstjänster.

### 1.1 Git och källkod
- Den nya koden ska kopplas mot beställarens Git-repo: `https://github.com/hemip/strandapp`.
- All ny utveckling ska utgå från detta repo.
- Repo:t är i nuläget tomt.
- Vi bygger därför först grunden för den nya appen och publicerar därefter första versionen till repo:t.
- Den första publiceringen ska innehålla projektstruktur, Android-stöd, React Native-grund, grundläggande konfigurationsstöd och dokumentation.
- Branch-strategi, commits och leveranser ska anpassas till detta repo.

### 2. Språk
- Allt användargränssnitt ska vara på svenska.
- Felmeddelanden, etiketter, menyer, knappar och statusmeddelanden ska vara på svenska.
- `basic_data` ska kunna innehålla svenska etiketter och hjälptekniktermer.

### 3. Lagring av filer
- Alla genererade JSON-filer ska sparas på telefonen i en mapp som användaren kan nå via Files eller motsvarande filhanterare.
- Alla foton ska sparas i samma användartillgängliga filstruktur, inte i en privat appmapp.
- Appen får inte låsa in filer i sandboxad intern lagring om det gör dem osynliga för användaren.
- Filstrukturen ska vara tydlig och förutsägbar.

### 4. GPS
- Appen ska använda telefonens GPS.
- En ikon i headern ska alltid visa GPS-status.
- Vid klick på GPS-ikonen ska en vy eller modal öppnas som visar:
  - aktuell GPS-status
  - koordinater
  - noggrannhet
  - tid för senaste position
  - eventuell felstatus, till exempel att GPS saknas eller inte har behörighet
- GPS-status ska uppdateras löpande medan användaren arbetar i appen.

### 5. Konfigurationsstyrd app via `basic_data`
- Alla parametrar som användaren ska kunna mata in ska definieras i `basic_data` som JSON.
- Om verksamheten vill lägga till en ny parameter ska det i normalfallet räcka att uppdatera JSON-filen.
- Appen ska läsa konfigurationen och rendera rätt fält i rätt flik, med rätt format och rätt etikett.
- Så lite som möjligt ska vara hårdkodat i appen.

### 6. Hämtning av grunddata från internet
- När användaren öppnar appen första gången ska appen hämta ner `basic_data` från internet.
- Samma initiala hämtning ska även omfatta:
  - artlistor
  - värdelistor
  - årets utlägg
  - andra nödvändiga uppslagsdata
- Dessa filer ska sedan sparas lokalt för offline-användning.

### 7. API-URL:er via `basic_data`
- Mottagar-API-URL för JSON eller annan dataleverans ska komma via `basic_data`.
- URL för fotouppladdning ska också komma via `basic_data`.
- Appen får alltså inte ha dessa endpoints hårdkodade i klientkoden.

### 8. Gemensamt inventeringstillfälle för flera inventerare
- En transekt kan inventeras av 1, 2 eller 3 inventerare.
- Alla som deltar i samma inventeringstillfälle ska skicka med samma UUID till servern.
- UUID:t ska identifiera själva inventeringstillfället, inte bara en enskild användares del av arbetet.
- En inventerare ska kunna vara `master`.
- Master ska kunna visa inventeringstillfällets UUID som QR-kod i appen.
- Övriga inventerare ska kunna läsa in samma UUID i sina appar genom att skanna master-koden.
- Servern ska kunna använda detta UUID för att slå ihop delmängderna till en gemensam leverans.

## Önskad målbild
Vi bygger en Android-app i React Native som fungerar offline i fält, men som kan bootstrapa sig själv från en uppsättning JSON-filer och URL:er från servern. Appen ska i hög grad vara datadriven, där skärmar och fält styrs av konfiguration snarare än av specialskriven kod per parameter.

## Arkitekturprinciper

### 1. Offline first
- Användaren ska kunna arbeta utan nät efter första datanedladdningen.
- Inmatningar, JSON-filer och foton ska finnas lokalt.
- Synk och uppladdning ska kunna ske senare.

### 2. Konfigurationsdriven rendering
- Formulär ska byggas från JSON-definitioner.
- Flikar, sektioner, fält, validering, etiketter och hjälptexter ska kunna beskrivas i data.
- Kod ska främst hantera rendering, lagring, validering och synk, inte hårdkodade fältlistor.

### 3. Tydlig filhantering
- Allt som produceras av användaren ska kunna hittas i en känd mapp på telefonen.
- Appen ska ha en stabil struktur för:
  - konfigurationsfiler
  - exportfiler
  - foton
  - cache av nedladdad metadata

### 4. Separera data, domänlogik och UI
- `basic_data` ska inte blandas ihop med lagrad inventeringsdata.
- GPS, kamera, filsystem, formulärrendering och synk ska delas upp i separata moduler.

### 5. Samarbetsflöde för inventering
- Appen ska ha ett tydligt begrepp för `inventeringstillfälle`.
- UUID för inventeringstillfället ska följa med i lokal data och i uppladdning.
- Master- och hjälparläge ska vara en del av datamodellen.
- QR-visning och QR-inläsning ska behandlas som kärnfunktioner.

## Leveransmodell mot Git
- Första steget är att bygga en fungerande grund lokalt i projektet.
- När grundstrukturen är klar ska den publiceras till beställarens tomma repo `https://github.com/hemip/strandapp`.
- Första uppladdningen ska vara tillräckligt komplett för att fungera som officiell startpunkt för fortsatt utveckling.
- Dokumentation, grundkonfiguration och kodstruktur ska följa med i första publiceringen.

## Föreslagen filstruktur på telefonen
Exempel på målstruktur i publik lagring:

```text
Havsstrand/
  basic_data/
    basic_data.json
    artlistor/
    vardelistor/
    utlagg/
  data/
    provytor/
      <provyta-id>.json
  export/
    <provyta-id>.json
  photos/
    <provyta-id>/
      standard/
      extra/
      deponi/
```

Mål med strukturen:
- lätt att förstå för användaren
- lätt att felsöka
- lätt att exportera manuellt om det behövs
- samma struktur kan användas av synkfunktioner

## Förslag på innehåll i `basic_data`
`basic_data` bör minst kunna beskriva:
- appmetadata
- versionsnummer för konfigurationsdata
- mottagar-API-URL
- foto-uppladdnings-URL
- listor över artfiler och andra resurser som ska hämtas
- flikar i appen
- sektioner i varje flik
- fältdefinitioner
- fälttyper
- valideringsregler
- optionslistor
- synlighetsregler
- obligatoriska fält
- defaultvärden
- svenska etiketter och hjälptexter

Exempel på fälttyper som appen bör stödja från början:
- text
- numeriskt värde
- decimalvärde
- ja eller nej
- enkelval
- flerval
- datum och tid
- GPS-baserat fält
- foto
- tabell eller repeater
- artval från artlista

## Förslag på JSON-modell för formulär
Exempel, förenklad:

```json
{
  "tabs": [
    {
      "id": "hydro",
      "label": "Hydro",
      "sections": [
        {
          "id": "hydro_bas",
          "label": "Grunddata",
          "fields": [
            {
              "id": "brygga",
              "label": "Brygga",
              "type": "boolean",
              "required": false
            },
            {
              "id": "vattendjup",
              "label": "Vattendjup",
              "type": "integer",
              "required": true,
              "unit": "dm"
            }
          ]
        }
      ]
    }
  ],
  "endpoints": {
    "dataUploadUrl": "https://example.se/api/upload-data",
    "photoUploadUrl": "https://example.se/api/upload-photo"
  }
}
```

## Huvudmoduler i nya appen

### 1. Appstart och bootstrap
Ansvar:
- kontrollera om lokal `basic_data` finns
- vid första körning hämta ner `basic_data` och relaterade filer
- spara dessa i publik lokal mapp
- hantera versionskontroll för konfiguration

### 2. Konfigurationsmotor
Ansvar:
- läsa `basic_data`
- tolka flikar, sektioner och fält
- skapa runtime-modell för formulär

### 3. Form renderer
Ansvar:
- rendera rätt UI-komponent utifrån fälttyp
- visa etiketter, hjälptext, validering och defaultvärden
- gruppera fält i rätt flik och sektion

### 4. Lokal datalagring
Ansvar:
- spara inventeringsdata som JSON per provyta
- hålla metadata om sparstatus och synkstatus
- läsa och skriva till publik mapp på Android
- spara inventeringstillfällets UUID tillsammans med inventeringsdatan

### 5. Fotomodul
Ansvar:
- ta foto via telefonens kamera
- spara bildfil i publik mapp
- koppla foto till rätt provyta och rätt kategori
- visa miniatyrer och metadata

### 6. GPS-modul
Ansvar:
- läsa GPS från telefonen
- exponera aktuell status i headern
- exponera detaljerad status i GPS-dialog
- leverera koordinater och noggrannhet till andra moduler

### 7. Synk- och uppladdningsmodul
Ansvar:
- läsa endpoint-URL:er från `basic_data`
- ladda upp JSON-data
- ladda upp foton
- hantera köer, fel och återförsök
- alltid skicka med inventeringstillfällets UUID i uppladdningen

### 8. Samarbetsmodul
Ansvar:
- skapa eller återanvända inventeringstillfälle
- hantera master- och hjälparläge
- generera QR-kod för master
- läsa in QR-kod hos hjälpare
- säkerställa att samma inventeringstillfälle UUID används av alla i samma transekt

### 9. Artlistemodul
Ansvar:
- läsa artlistor från lokala JSON- eller CSV-filer
- stödja sökning, filtrering och kategorier
- användas av formulärrenderaren där fälttypen kräver artval

## Förslag på tekniska delmål

### Milstolpe 1: Projektgrund
Leverabler:
- arbetet är kopplat till beställarens Git-repo `https://github.com/hemip/strandapp`
- nytt React Native-projekt för Android
- svensk grundstruktur
- navigation
- grundläggande tema och header
- GPS-ikon i header som platshållare
- första publicerbara grundversion för tomt repo

Klart när:
- appen startar på Android
- svenska texter används
- grundlayout finns
- projektet är redo att skickas upp som första version till repo:t

### Milstolpe 2: Bootstrap av `basic_data`
Leverabler:
- första uppstart hämtar `basic_data`
- artlistor, värdelistor och årets utlägg hämtas ner
- filer sparas i publik användarmapp
- enkel versionshantering av nedladdad konfiguration

Klart när:
- användaren kan installera appen och få ned grunddata utan manuell filkopiering
- filerna syns i telefonens filhanterare

### Milstolpe 3: Konfigurationsstyrd formulärrendering
Leverabler:
- formulär renderas från `basic_data`
- stöd för kärnfälttyper
- flikar och sektioner byggs från JSON

Klart när:
- ett nytt fält kan läggas till via JSON och visas i appen utan kodändring i renderflödet

### Milstolpe 4: Lokal sparning av inventering
Leverabler:
- provytedata sparas som JSON lokalt
- status för sparad, osynkad och uppladdad data finns
- användaren kan öppna tidigare sparad provyta

Klart när:
- inventering går att starta, spara, stänga och återuppta offline

### Milstolpe 5: Foto och GPS
Leverabler:
- kamera fungerar
- bilder sparas i publik mapp
- GPS-status visas i header
- GPS-detaljvy visar koordinater, noggrannhet, status och senaste uppdatering

Klart när:
- användaren kan ta bilder och se dem i telefonens Files-app
- GPS-information är begriplig och uppdateras korrekt

### Milstolpe 6: Uppladdning
Leverabler:
- datauppladdning mot endpoint från `basic_data`
- fotouppladdning mot endpoint från `basic_data`
- enkel köhantering och felvisning

Klart när:
- en komplett provyta med foton kan laddas upp mot konfigurerad server

## Prioriterad backlog

### P0: Måste finnas först
- arbeta i beställarens Git-repo `https://github.com/hemip/strandapp`
- bygga en första grundversion som kan publiceras till ett tomt repo
- skapa React Native-projekt för Android
- sätt upp svensk appstruktur
- definiera publik lagringsstrategi för Android
- skapa bootstrap för första hämtning av `basic_data`
- spara `basic_data` lokalt i publik mapp
- skapa GPS-modul med headerikon
- skapa grundläggande formulärrendering från JSON
- spara provytedata som JSON i publik mapp
- spara foton i publik mapp
- läsa upload-URL:er från `basic_data`

### P1: Bör finnas tidigt
- artlistor och värdelistor från nedladdade filer
- validering per fält från `basic_data`
- synkstatus per provyta
- återöppning av sparad provyta
- bättre felhantering kring nät och filskrivning

### P2: Nästa steg
- stöd för mer avancerade tabell- och repeaterfält
- versionsmigrering av lokal data
- förbättrad fotometadata
- diagnostikvy för konfiguration och bootstrap

## Konkreta implementationstasks

### A. Projekt och grundsetup
- koppla den nya kodbasen till beställarens repo `https://github.com/hemip/strandapp`
- förbereda första publicering till ett tomt repo
- skapa nytt React Native-projekt
- konfigurera Android build
- sätt upp TypeScript om vi väljer typed kodbas
- skapa svensk basstruktur för navigation och tema
- definiera appens header med plats för GPS-statusikon

### B. Android-filsystem
- utvärdera exakt var appen ska skriva filer för att de ska vara synliga i Files
- implementera katalogskapande i publik lagring
- implementera helper för att läsa, skriva, lista och radera filer
- definiera namnstandard för JSON och foton

### C. Bootstrap av grunddata
- implementera första-start-logik
- hämta `basic_data` från internet
- hämta artlistor, värdelistor och årets utlägg
- spara allt lokalt
- spara metadata om senaste hämtning och version
- implementera fallback om nedladdning misslyckas

### D. Konfigurationsmodell
- definiera schema för `basic_data`
- definiera schema för fält, flikar, sektioner, värdelistor och endpoints
- skapa parser och validator för inkommande JSON
- skapa intern runtime-modell som UI kan rendera från

### E. Form renderer
- bygg komponenter för grundfält
- bygg stöd för boolean, numeriskt, text, enkelval och flerval
- koppla validering till JSON-definitioner
- koppla etiketter, hjälptexter och defaultvärden till JSON
- bygg stöd för att visa fält i rätt flik

### F. Inventeringsdata
- skapa datastruktur för lokal provytedata
- skapa service för att skapa, uppdatera och läsa provytor
- spara data som JSON-filer
- skapa statusfält för ändrad, sparad, osynkad och uppladdad data

### G. GPS
- integrera GPS på Android
- skapa hook eller service för positionsdata
- visa statusikon i headern
- skapa klickbar GPS-panel eller modal
- visa koordinater, status, noggrannhet och senaste uppdatering
- hantera permission-flöde på svenska

### H. Foton
- integrera kamera
- spara foton till publik mapp
- koppla foto till provyta och fototyp
- visa miniatyrer
- definiera hur fotouppladdnings-URL används från `basic_data`

### I. Uppladdning
- implementera datauppladdning mot endpoint från `basic_data`
- implementera fotouppladdning mot endpoint från `basic_data`
- hantera retries och fel
- skapa enkel statusvisning för uppladdning

### J. Artlistor
- definiera format för lokala artlistor
- bygg sök- och filtreringskomponent
- koppla artlistor till konfigurerade fälttyper

## Acceptanskriterier

### Filhantering
- användaren kan hitta JSON-filer i telefonens filhanterare
- användaren kan hitta foton i telefonens filhanterare
- filer ligger inte enbart i privat appmapp

### GPS
- en GPS-ikon syns i headern
- ikonens status ändras beroende på GPS-läge
- klick på ikonen visar koordinater, noggrannhet, status och senaste uppdatering

### Konfigurationsstyrning
- nya fält kan läggas till via `basic_data`
- nya fält visas i rätt flik och med rätt komponent utan ny hårdkodad skärmlogik
- endpoint-URL:er hämtas från `basic_data`

### Första uppstart
- appen hämtar grunddata från internet vid första körning
- grunddata sparas lokalt för offline-användning

### Svenska
- användargränssnittet är på svenska
- permissions- och felmeddelanden är på svenska

## Risker och beslut att ta tidigt

### 1. Publik lagring på Android
Vi behöver tidigt verifiera exakt vilken Android-lagringsmodell som bäst uppfyller kravet att filer ska synas i Files, samtidigt som appen fortfarande kan skriva och läsa stabilt på moderna Android-versioner.

### 2. Hur generisk `basic_data` ska vara
Om vi gör modellen för enkel blir appen fortfarande delvis hårdkodad. Om vi gör modellen för generell blir implementationen mer avancerad. Det här behöver balanseras tidigt.

### 3. Format på artlistor och värdelistor
Vi behöver besluta om dessa ska hämtas som JSON, CSV eller en kombination. För React Native är JSON oftast enklare längre fram i renderkedjan.

### 4. Synkstrategi
Vi behöver välja om datauppladdning ska vara manuell, automatisk eller köbaserad med återförsök i bakgrunden.

## Rekommenderat arbetssätt
1. Börja med publik lagring, bootstrap och `basic_data`.
2. Bygg sedan renderingsmotorn för formulär.
3. Lägg därefter på lokal provytedata.
4. Integrera GPS och foto tidigt, eftersom de är centrala plattformsfunktioner.
5. Bygg uppladdning först när lokal datamodell och filstruktur är stabil.

## Första konkreta sprintförslag

### Sprint 1
- skapa projekt
- sätt upp Android-bygg
- skapa grundnavigation
- skapa header med GPS-plats
- implementera publik filstruktur
- skapa bootstrap som laddar ner `basic_data`

### Sprint 2
- definiera schema för `basic_data`
- bygg parser och validator
- bygg första versionen av formulärrenderaren
- rendera minst en flik från JSON

### Sprint 3
- spara provytedata som JSON
- implementera kamera och lagring av foton
- implementera GPS-status och GPS-detaljvy

### Sprint 4
- koppla artlistor och värdelistor
- implementera uppladdning via URL:er från `basic_data`
- bygg felhantering och status för synk

## Slutnotering
Den viktigaste principen i denna nya app är att verksamhetsförändringar så långt möjligt ska kunna göras genom att uppdatera `basic_data`, inte genom att bygga om klientkoden. All implementation bör därför granskas utifrån frågan:

Kan detta beskrivas i data i stället för att hårdkodas?

