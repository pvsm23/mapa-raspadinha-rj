# Publica o APK que está em Downloads como um "release" no GitHub, na
# tag da versão atual (lida de android/app/build.gradle). O link
#   https://github.com/pvsm23/mapa-raspadinha-rj/releases/latest/download/Desbrava.apk
# sempre aponta pro último release -- é pra ele que o botão "Baixar app"
# do site aponta (URL_APK em js/script.js).
#
# Pré-requisito (UMA vez só): gh instalado e logado ->  gh auth login
#
# Uso (a partir da raiz do projeto, num PowerShell novo pra pegar o gh no PATH):
#   powershell -File tools/publicar-apk.ps1

$ErrorActionPreference = "Stop"
$repo = "pvsm23/mapa-raspadinha-rj"
$apk = "$env:USERPROFILE\Downloads\Desbrava.apk"

# gh pode não estar no PATH da sessão recém-instalada
$gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
if (-not $gh) { $gh = "C:\Program Files\GitHub CLI\gh.exe" }
if (-not (Test-Path $gh)) { throw "gh (GitHub CLI) não encontrado. Instale com: winget install GitHub.cli" }

if (-not (Test-Path $apk)) { throw "APK não encontrado em $apk -- gere o build primeiro." }

# Versão vem do build.gradle (versionName "x.y.z")
$gradle = Get-Content "android\app\build.gradle" -Raw
if ($gradle -notmatch 'versionName\s+"([^"]+)"') { throw "Não achei versionName em android/app/build.gradle" }
$ver = $Matches[1]
$tag = "v$ver"

Write-Host "Publicando Desbrava $tag ($apk)..."

# Já existe release nessa tag? Então só substitui o arquivo (--clobber);
# senão, cria. O gh escreve "release not found" no stderr quando não
# existe -- por isso baixamos o ErrorActionPreference nessa checagem, pra
# esse aviso esperado não virar erro terminante.
$ErrorActionPreference = "Continue"
& $gh release view $tag --repo $repo 2>$null 1>$null
$existe = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = "Stop"

if ($existe) {
  & $gh release upload $tag $apk --repo $repo --clobber
} else {
  & $gh release create $tag $apk --repo $repo --title "Desbrava $ver" --notes "APK do Desbrava versão $ver."
}

Write-Host ""
Write-Host "Pronto! Link de download (sempre a versão mais recente):"
Write-Host "  https://github.com/$repo/releases/latest/download/Desbrava.apk"
