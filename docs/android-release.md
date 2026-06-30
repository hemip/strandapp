# Android release-APK

GitHub Actions bygger en signerad release-APK via `.github/workflows/android-release-apk.yml`.

## När byggs APK?

- Vanliga pushar till `main` bygger ingen release-APK. De används bara för att dela kod.
- Varje tagg som börjar med `v`, till exempel `v0.1.10`, bygger en signerad APK, sparar den som GitHub artifact och laddar även upp den till SFTP om SFTP-secrets finns.

## Skapa release-keystore

Skapa keystore en gång och spara den säkert utanför Git:

```powershell
keytool -genkeypair -v `
  -keystore strand-release.keystore `
  -alias strand-release `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000
```

Viktigt: samma keystore måste användas för alla framtida uppdateringar. Android accepterar inte en uppdatering av appen om APK:n signeras med en annan keystore.

## Lägg in GitHub Secrets

Konvertera keystore-filen till Base64:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("strand-release.keystore")) | Set-Clipboard
```

Lägg sedan in dessa i GitHub under `Settings -> Secrets and variables -> Actions`:

```text
ANDROID_KEYSTORE_BASE64
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
SFTP_HOST
SFTP_PORT
SFTP_USER
SFTP_PASSWORD
SFTP_APK_DIR
```

`SFTP_PORT` kan vara `22`.

`SFTP_APK_DIR` kan till exempel vara:

```text
apk
```

Om SFTP-secrets saknas skapas APK:n ändå som artifact, men den laddas inte upp till servern.

## Skapa ny version

Höj appens version med en Git-tagg:

```powershell
git tag v0.1.10
git push origin v0.1.10
```

GitHub Actions skapar då:

```text
strand-0.1.10.apk
strand-latest.apk
```

Vanliga pushar till `main` skapar ingen APK. Skapa och pusha en versionstagg när en APK ska publiceras.

## Lokal release-build

För lokal release-build behöver du exportera samma värden som workflowet använder:

```powershell
$env:ANDROID_KEYSTORE_FILE="C:\sokvag\strand-release.keystore"
$env:ANDROID_KEYSTORE_PASSWORD="..."
$env:ANDROID_KEY_ALIAS="strand-release"
$env:ANDROID_KEY_PASSWORD="..."
$env:VERSION_CODE="10"
$env:VERSION_NAME="0.1.10"

cd mobile\android
.\gradlew.bat :app:assembleRelease
```

APK:n hamnar här:

```text
mobile/android/app/build/outputs/apk/release/app-release.apk
```
