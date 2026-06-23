# Skapa ny APK-version

När koden är klar och pushad till `main` kan en ny installerbar APK skapas genom att tagga versionen i Git.

## 1. Hämta senaste kod

```powershell
git checkout main
git pull origin main
```

## 2. Skapa och pusha en versionstagg

Välj nästa versionsnummer, till exempel `v0.1.0`, `v0.1.1` osv.

```powershell
git tag v0.1.0
git push origin v0.1.0
```

Detta startar GitHub Actions-workflowet `Android release APK`.

## 3. Följ bygget

Gå till GitHub:

```text
Actions -> Android release APK
```

Öppna senaste körningen och kontrollera att alla steg blir gröna.

## 4. Var APK-filen finns

När bygget är klart finns APK:n som GitHub artifact i workflow-körningen:

```text
strand-apk-<version>
```

Packa upp artifact-zippen. Där finns:

```text
strand-<version>.apk
strand-latest.apk
```

Vid versionstaggar laddas APK:n även upp till SFTP-servern i:

```text
apk/strand-<version>.apk
apk/strand-latest.apk
```

`strand-latest.apk` är alltid senaste versionen som inventerarna kan ladda ner.

## Viktigt

- Skapa bara tagg när `main` innehåller koden som ska släppas.
- Återanvänd inte samma versionstagg.
- Android kräver att alla framtida APK:er signeras med samma release-keystore.
- Om en telefon redan har appen installerad kan den bara uppdateras med en APK som har högre `versionCode` och samma signering.
