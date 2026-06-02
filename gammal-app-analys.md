# Analys av gamla appen `strand2018-master`

## Syfte
Detta dokument sammanfattar den gamla Android-appen och fungerar som underlag för en total ombyggnad i React Native. Fokus ligger på:
- vilka sidor och skärmar som finns
- vilka funktioner de innehåller
- hur navigationen fungerar
- vilken data som lagras per `provyta`
- vilka beroenden mot kamera, GPS, filer och export som måste ersättas i den nya appen

## Kort sammanfattning
Appen är en fältapp för havsstrandsinventering. Den är byggd i Java för Android och kretsar kring ett centralt domänobjekt: `Provyta`.

Användaren väljer först en ruta och en provyta, startar eller återupptar en inventering, samlar in bilder och mätdata i flera delskärmar, och kan därefter exportera och ladda upp både JSON, rådata och bilder.

## Teknisk översikt
- Plattform: Android, Java, klassiska `Activity`-skärmar
- Paketrotsnamn: `com.teraim.strand`
- Startaktivitet: `Start`
- Primär datamodell: `Provyta`
- Lagring: serialiserade objektfiler på lokal disk
- Bilder: lagras som filer under lokal bildkatalog
- Export: JSON-filer per provyta
- Uppladdning: SFTP till extern server
- Källdata för valbara provytor: `app/src/main/res/raw/data.csv`
- Källdata för artlistor: flera CSV-filer i `app/src/main/res/raw/`

## Övergripande användarflöde
1. Appen startar i en permissions- och startskärm.
2. Appen initierar lokala mappar första gången.
3. Användaren väljer `ruta`, `provyta`, lagnummer och inventerare.
4. Användaren väljer ett läge:
   - `Inventera`
   - `Avståndsinventera`
   - `Markera klar`
   - `Inventera ej`
5. Om provytan är normal inventering går användaren vidare till bild- och GPS-skärm.
6. Därefter fortsätter inventeringen via zon- och inmatningsskärmar.
7. Data autosparas lokalt under arbetets gång.
8. Från startskärmen kan användaren exportera och ladda upp data.

## Skärmar och funktioner

### 1. `Start`
Ansvar:
- begär runtime-rättigheter för lagring och plats
- skapar lokala kataloger första gången appen körs
- skickar användaren vidare till huvudsidan

Funktioner:
- initierar mappar för data, export och bilder
- använder en tokenfil för att avgöra om appen körs första gången

Teknisk betydelse för React Native:
- behöver ersättas med onboarding-, init- och permission-logik

### 2. `ActivityMain`
Detta är huvudingången till inventeringen.

Ansvar:
- laddar in alla tillgängliga provytor från `data.csv`
- låter användaren välja `ruta` och `provyta`
- visar status för vald provyta
- startar rätt arbetsflöde beroende på inventeringstyp
- öppnar export

UI och funktioner:
- textfält för lagnummer och inventerare
- dropdown för ruta
- dropdown för provyta
- dropdown för alternativ:
  - Inventera
  - Avståndsinventera
  - Markera klar
  - Inventera ej
- statuspanel som visar om provytan är:
  - ny
  - påbörjad
  - markerad klar
- knapp för export

Affärslogik:
- laddar tidigare sparad aktuell provyta om sådan finns
- kan återöppna låst provyta efter varning
- kan skriva över en tidigare `inventeras ej`-yta med normal inventering
- `Markera klar` låser provytan
- `Inventera ej` skapar en förenklad provyta utan normal insamling

Kommentar för React Native:
- detta bör bli en central skärm för val av provyta och dashboard
- status- och låslogik behöver behållas

### 3. `ActivityTakePicture`
Första steget i normal inventering.

Ansvar:
- tar standardbilder för provytan
- läser GPS-position
- låter användaren sätta startpunkt
- sparar riktning
- går vidare till zonindelning

Standardbilder:
- `slut`
- `sup`
- `upp`
- `ut`
- `left`
- `right`

Funktioner:
- kameraöppning per bildknapp
- visuell återkoppling när bild finns
- GPS-uppdatering via enhetens platsdata
- knapp för att sätta startpunkt i SWEREF-liknande koordinater
- fält för `riktning`

Kommentar för React Native:
- kamera- och platsbehörigheter är centrala
- bildstatus per obligatorisk vy behöver modelleras tydligt

### 4. `ActivityZoneSplit`
Appens största formulärskärm. Den fungerar som en hubb med flera delsektioner.

Sektioner:
- Extra
- Supra
- Geo
- Hydro
- Övrigt
- Habitat
- Träd
- Deponi
- Buskar
- Drift

Generell funktion:
- varje sektion renderar ett dynamiskt formulär i samma vy
- fält öppnas via popup eller dialog och sparas direkt i `Provyta`
- vissa sektioner innehåller knappar vidare till specialskärmar

#### Extra
Fält:
- lutning extralitoral
- marktyp extralitoral
- total fältskiktstäckning
- trädtäckning extralitoral
- extralitoral slutlängd

Knappar:
- `Substrat`
- `Arter`

#### Supra
Fält:
- lutning supralitoral
- marktyp supralitoral
- total fältskiktstäckning
- total trädtäckning
- supralitoral slutlängd

Knappar:
- `Substrat`
- `Arter`

#### Geo
Fält:
- lutning geolitoral
- marktyp geolitoral
- total fältskiktstäckning
- total trädtäckning
- geolitoral slutlängd

Knappar:
- `Substrat`
- `Arter`

#### Hydro
Fält:
- brygga ja eller nej
- längd vassbälte
- vasstäthet
- vågexponering
- strandtyp
- kusttyp
- vattendjup

Knapp:
- `Substrat`

#### Övrigt
Fält:
- rekreationstyp
- röjning
- röjningstid
- högsta klippa i transekten
- stängsel ja eller nej

#### Habitat
Knapp:
- `Habitat`

#### Träd
Fält:
- trädförekomst på öar

Knapp:
- `Trädarter`

#### Deponi
Funktion:
- visar en tabell med fasta deponikategorier
- varje rad går att editera och koppla bilder till

#### Buskar
Fält:
- total busktäckning

Knapp:
- `Buskarter`

#### Drift
Knapp:
- `Driftvallar`

Kommentar för React Native:
- detta bör sannolikt delas upp i flera mindre skärmar eller tabs och sektioner
- popup-redigering kan ersättas med inline-formulär eller bottom sheets

### 5. `ActivitySubstratSelection`
Matris för substratfördelning över fyra zoner.

Ansvar:
- låter användaren ange procentfördelning per zon
- använder en grid med seekbars i popup
- försöker normalisera summan till 100

Zoner:
- Hydro
- Geo
- Supra
- Extra

Rader och substrattyper:
- Organiskt
- Lera
- Sand
- Grus
- Sten
- Block
- Häll
- Artificiell

Särdrag:
- gammal speciallogik som automatiskt justerar seekbars för att nå 100
- data lagras som `String[][] substrat` i `Provyta`

Kommentar för React Native:
- denna del behöver en modernare UX, men reglerna kring 100 procents summa måste definieras och bevaras

### 6. `ActivitySelectArt`
Mellanskärm för att välja artkategori innan artinmatning öppnas.

Kategorier:
- örter
- ris
- graminider
- ormbunkar
- mossor
- lavar

Funktion:
- skickar vald kategori vidare till `ActivityArterFaltskikt`

### 7. `ActivityArterFaltskikt`
Generisk artinmatningsskärm för flera artkategorier.

Används för:
- trädarter
- buskarter
- graminider
- lavar
- mossor
- örter
- ris
- ormbunkar

Funktioner:
- alfabetisk sidomeny A-Ö
- lista över arter från CSV-fil
- sortering på familj, släkte, svenskt namn
- klick på art skapar en rad i en tabell
- långtryck på rad tar bort posten

Olika radtyper:
- förekomstbaserad art: kryss per zon
- täckningsbaserad art: procentvärden per zon
- antalbaserad art: antal per zon

Kommentar för React Native:
- detta är en tydlig kandidat för återanvändbara komponenter: artlista, arteditor och datatabell

### 8. `ActivityHabitat`
Specialskärm för habitatregistrering.

Ansvar:
- bygger habitat-tabell
- hanterar ovan-habitat
- hanterar dynhabitat som specialfall

Funktioner:
- välj habitatkod och namn via dropdown
- skapa habitatrader med:
  - kod
  - namn
  - minsta kriterium eller utbredning
  - start
  - slut
  - kriterie
- speciallogik för `dynhabitat` som öppnar separat dyntabell
- fält för habitat ovanför stranden
- specialfält när ovan-habitat är “inget habitat”

Extra metadata per habitatrad:
- fågelskrämma inom 50 m
- siktröjning
- busktäckning
- krontäckning
- grov död ved
- skogssuccession
- betesregim
- betestryck

Kommentar för React Native:
- detta är en av de mest komplexa delarna och bör modelleras explicit som en separat feature, inte som bara ett formulär

### 9. `ActivityVallar`
Skärm för driftvallar.

Funktioner:
- tabell där användaren kan lägga till rader
- två särskilda fotoknappar: `drift1`, `drift2`
- varje rad innehåller 12 kolumner:
  - driftnummer
  - position
  - bredd
  - höjd
  - längd
  - tång procent
  - gren
  - vegetation
  - plast
  - övrigt skräp
  - annueller
  - perenner

Kommentar för React Native:
- bör bli en ordentlig repeatable form eller lista med fotosektion

### 10. `ActivityNoInput`
Skärm för provytor som inte inventeras normalt.

Ansvar:
- låter användaren ange orsak till `inventera ej`
- låter användaren ta en dokumentationsbild

Orsaker inkluderar bland annat:
- tillfälligt vattentäckt
- otillgänglig våtmark
- åkermark med annuell gröda
- slåttermark
- rasrisk
- beträdnadsförbud
- annan orsak via blå lapp

Kommentar för React Native:
- enkel men viktig specialgren i flödet

### 11. `ActivityImage`
Bildvisning för deponi.

Ansvar:
- visar alla bilder kopplade till en viss deponityp
- låter användaren ta fler bilder
- låter användaren öppna eller radera bilder

### 12. `ActivityExtraImages`
Hanterar extra bilder utanför standardbilduppsättningen.

Funktioner:
- lägg till ny extra bild
- lista alla extra bilder för aktuell provyta
- editera metadata per bild:
  - namn
  - kommentar
  - tag
- öppna bild i extern viewer
- ta bort bild

Kommentar för React Native:
- detta är i praktiken ett litet mediebibliotek knutet till provytan

### 13. `ActivityExport`
Skärm för export av lokala provytor.

Ansvar:
- laddar alla lokalt sparade provytor
- genererar JSON för varje provyta
- visar lista över exporterbara objekt
- exporterar markerade provytor till lokal exportkatalog
- öppnar uppladdning

Funktioner:
- visar appversion
- skiljer på normal inventering och `inventera ej`
- skapar JSON per provyta

### 14. `UploadActivity`
Skärm för serveruppladdning.

Ansvar:
- laddar upp exportfiler, rådatafiler och bilder via SFTP

Vad som laddas upp:
- JSON-exporter
- serialiserade provytefiler
- bildfiler

Funktioner:
- progressbar
- resultatlista över uppladdade filer
- användarnamn skapas av fast prefix plus lagnummer

Kommentar för React Native:
- denna funktion är säkerhets- och driftkritisk
- den nuvarande lösningen innehåller hårdkodad serverkonfiguration och bör designas om

### 15. `SendLog`
Finns registrerad i manifestet och används i exportpaketet för logghantering vid krascher, men är inte central för själva inventeringsflödet.

## Menyfunktioner som finns på flera skärmar
Basaktiviteten `M_Activity` lägger till en gemensam meny på många skärmar.

Globala funktioner:
- sparstatusindikator
- visning av aktuell ruta
- visning av aktuell provyta
- `Blå lapp`
- `Extra Bild`

### Blå lapp
- fri textkommentar kopplad till aktuell provyta
- tillgänglig från flera inventeringsskärmar

### Extra Bild
- genväg till `ActivityExtraImages`

### Sparstatus
- timer uppdaterar UI kontinuerligt
- visar om aktuell `Provyta` har osparade ändringar

## Datamodell: `Provyta`
`Provyta` är kärnan i appen och innehåller både enkla fält och flera tabeller.

### Metadata och grunddata
- `pyID`
- `ruta`
- `provyta`
- `lagnummer`
- `inventerare`
- `inventeringstyp`
- `year`
- `mätstart`
- låsstatus, `isLocked`
- normal eller ej normal inventering, `isNormal`

### GPS och riktning
- `riktning`
- `startPEast`
- `startPNorth`
- `gpseast`
- `gpsnorth`

Kommentar:
- i nuvarande kod sätts startpunkt aktivt i bildskärmen
- `gpseast` och `gpsnorth` finns i modellen men används inte tydligt i det lästa flödet

### Zon- och miljöfält
- brygga
- busktäckning
- dyner blottad sand
- exponering
- orsak
- kriteriestrand
- kriterieovan
- klippamax
- kusttyp
- lutning extra, geo och supra
- marktyp extra, geo, supra och ovan
- ovanhabitat
- rekreation
- röjning
- röjningstid
- slutlängd geo, supra och ovan
- strandtyp
- stängsel
- trädförekomst
- trädtäckning geo, supra och extra
- vägtäckning i fältskikt geo, supra och extra
- vasslängd
- vattendjup
- vasstäthet
- blå lapp

### Tabeller i `Provyta`
- `träd`
- `buskar`
- `arter`
- `vallar`
- `habitat`
- `dyner`
- `deponi`
- `extraImages`

### Matrisdata
- `substrat` som tvådimensionell strängmatris

## Tabellstrukturer

### Träd
Kolumner:
- avstånd
- art
- diameter
- antal

### Buskar
Kolumner:
- avstånd
- art
- bredd
- längd
- täthet

### Arter
Kolumner:
- namn
- geo
- supra
- extra
- drift

Obs:
- värdena kan vara kryss, antal eller procent beroende på artdefinition

### Vallar
Kolumner:
- driftnummer
- position
- bredd
- höjd
- längd
- tång procent
- gren
- vegetation
- plast
- övrigt skräp
- annueller
- perenner

### Habitat
Basfält per rad:
- kod
- namn
- utbredning eller minimikriterium
- start
- slut
- kriterie

Utökade habitatfält per rad:
- fågelskrämma
- siktröjning
- busktäckning
- krontäckning
- grov död ved
- skogssuccession
- betesregim
- betestryck

### Dyner
Kolumner:
- kod
- namn
- utbredning
- längd
- kriterie

### Deponi
Fasta kategorier vid skapande av ny normal provyta:
- tång
- gren, kvist och ved
- annan vegetation
- sågat eller bearbetat virke
- bryggdelar
- fiskenät
- fisklina
- plastflöten och bojar
- annat fiskerelaterat
- plastlådor
- petflaskor
- plastdunkar
- plastpåsar
- annan plast
- oljespill
- byggavfall
- grävmassor
- sten
- metallskrot
- övrigt

Varje rad innehåller:
- deponityp
- area eller antalvärde
- kopplade bilder via separat bildskärm

### ExtraImages
Kolumner:
- namn eller filnamn
- kommentar
- tag

## Källdata och uppslagslistor

### Provyteunderlag
`data.csv` innehåller minst följande kolumner:
- ruta
- vattendistrikt
- namn
- strandtyp
- kusttyp
- urvalsklass
- provyta
- pyid
- exponering
- transektlängd
- transektriktning
- easting
- northing
- longitud
- latitud

Detta underlag används för att bygga valbara `ruta` och `provyta`.

### Artlistor
Flera CSV-filer används beroende på artkategori, till exempel:
- `strandinventering_arter_trad.csv`
- `strandinventering_arter_buskar.csv`
- `strandinventering_arter_graminider.csv`
- `strandinventering_arter_lavar.csv`
- `strandinventering_arter_mossor.csv`
- `strandinventering_arter_orter.csv`
- `strandinventering_arter_ris.csv`
- `strandinventering_arter_ormbunkar.csv`

## Lagring och filstruktur
Lokala kataloger skapas under extern lagring:
- `strand/data/` för serialiserade `Provyta`-objekt
- `strand/exported/` för exporterade JSON-filer
- `strand/bilder/` för bildfiler

Bildnamn bygger på `pyID` och typ, till exempel:
- standardbilder: `pyID_slut.png`, `pyID_left.png` och så vidare
- deponibilder: `pyID_Deponi_<typ>_<nr>.png`
- extrabilder: `pyID_Extra_<nr>.png`

## Autospar och återupptagning
- aktuell provyta hålls globalt i `Strand.currentProvyta`
- osparade ändringar markeras via `saved`-flagga
- timer sparar provytan periodiskt till disk
- senaste aktiva provyta-ID sparas i `SharedPreferences`
- användaren kan återuppta påbörjad provyta vid nästa start

Kommentar för React Native:
- offline first och återupptagning är centrala krav
- lokal serialisering bör ersättas med robust modern lagring, till exempel SQLite, Realm, Watermelon eller AsyncStorage plus filsystem för bilder

## Exportformat
Export skapas som JSON per provyta.

Innehåller bland annat:
- metadata för provytan
- en lång lista med enkla fält
- tabellerna `Arter`, `Buskar`, `Habitat`, `Dyner`, `Deponi`, `Trad`, `Vallar`, `ExtraImages`
- `Substrat`

Två varianter finns:
- normal export
- förenklad export för `inventera ej`

## Viktiga beroenden och funktioner som måste ersättas i React Native
- Android `Activity`-baserad navigation
- lokala serialiserade Java-objekt
- `FileProvider` för kamera och bildvisning
- Android `AlertDialog`-baserad redigering
- `SharedPreferences`
- SFTP-uppladdning i klienten
- runtime permissions för lagring och plats

## Rekommenderad funktionsuppdelning för React Native
En rimlig målstruktur i React Native skulle kunna vara:
- `Start och init`
- `Välj provyta`
- `Provytaöversikt`
- `Standardbilder och startpunkt`
- `Zondata`
- `Substrat`
- `Arter`
- `Habitat och dyner`
- `Träd`
- `Buskar`
- `Deponi`
- `Driftvallar`
- `Extra bilder`
- `Export och synk`

## Ombyggnadsrisker och observationspunkter

### 1. Gammal UX-logik sitter delvis i tabellkomponenter
Mycket affärslogik ligger inte i centrala services utan i UI-klasser och popup-formulär. Den behöver lyftas ut och formaliseras.

### 2. Fil- och säkerhetsmodell är åldrad
Appen använder extern lagring och hårdkodade SFTP-inställningar. Detta bör inte bäras över oförändrat.

### 3. Datamodellen är bred men inte strikt typad
Många värden lagras som `String`, även där data egentligen är numerisk eller boolesk. En React Native-ombyggnad bör införa tydligare typer.

### 4. Navigationen är funktionell men inte domänmässigt ren
`ActivityZoneSplit` fungerar som ett stort nav för många olika features. Det är praktiskt i gammal Android men svårförvaltat i modern apparkitektur.

### 5. Exportformatet är viktigt att verifiera innan omskrivning
Om externa system redan konsumerar nuvarande JSON behöver formatet dokumenteras mer exakt innan implementation av ny export.

## Slutsats
Ja, den gamla appen går absolut att analysera och dokumentera, och den är tillräckligt tydlig för att användas som grund för en full ombyggnad i React Native.

Det viktigaste att ta med sig är att appen inte bara består av några formulär, utan av:
- ett tydligt provyteflöde
- flera specialiserade delmoduler
- tung offline-användning
- foto, GPS och export som förstaklassfunktioner
- ganska mycket dold affärslogik i gamla UI-klasser

## Föreslagna nästa steg
1. Verifiera exakt vilka delar som fortfarande är affärskritiska och vilka som kan förenklas i ny app.
2. Bryt ned `Provyta` till en modern datamodell med typer, relationer och versionshantering.
3. Skapa en skärmkarta eller wireframe-lista för nya appen baserat på detta dokument.
4. Specificera export- och synkkrav innan implementation startar.

