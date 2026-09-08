# Wissensdatenbank: Android APK CTF-Challenges

## Reverse Engineering mit IDA Pro, Frida, jadx-gui und Dalvik/Smali

---

## Inhaltsverzeichnis

1. [Grundlagen: Android-App-Architektur und APK-Format](#1-grundlagen-android-app-architektur-und-apk-format)
2. [Der CTF-Workflow: Methodischer Ansatz](#2-der-ctf-workflow-methodischer-ansatz)
3. [jadx-gui: Statische Java-Analyse](#3-jadx-gui-statische-java-analyse)
4. [Dalvik und Smali: Bytecode-Ebene](#4-dalvik-und-smali-bytecode-ebene)
5. [Frida: Dynamische Instrumentierung](#5-frida-dynamische-instrumentierung)
6. [IDA Pro: Native Code und ARM-Analyse](#6-ida-pro-native-code-und-arm-analyse)
7. [Tool-Kombination und fortgeschrittene Techniken](#7-tool-kombination-und-fortgeschrittene-techniken)
8. [Häufige CTF-Muster und Lösungsstrategien](#8-häufige-ctf-muster-und-lösungsstrategien)
9. [Referenzen](#referenzen)

---

## 1. Grundlagen: Android-App-Architektur und APK-Format

### 1.1 Die APK-Datei als ZIP-Archiv

Eine Android-Applikation (APK) ist im Kern ein ZIP-Archiv mit einer klar definierten internen Struktur. Das Verständnis dieser Struktur ist die Grundvoraussetzung für jede CTF-Analyse, da sie bestimmt, welches Tool für welchen Teil der Untersuchung geeignet ist. [1]

```
target.apk
├── AndroidManifest.xml      ← App-Konfiguration, Permissions, Einstiegspunkte (binär-XML)
├── classes.dex              ← Kompilierter Dalvik-Bytecode (Hauptlogik)
├── classes2.dex             ← Zusätzliche DEX-Dateien (Multidex-Apps)
├── resources.arsc           ← Kompilierte Ressourcen (Strings, Layouts)
├── res/                     ← Ressourcendateien (Layouts, Drawables)
├── assets/                  ← Rohdaten (oft interessante Konfigurationsdateien)
├── lib/                     ← Native Libraries (.so ELF-Dateien)
│   ├── arm64-v8a/           ← 64-Bit ARM (moderne Geräte)
│   ├── armeabi-v7a/         ← 32-Bit ARM (ältere Geräte)
│   └── x86_64/              ← x86 64-Bit (Emulatoren)
└── META-INF/                ← Signatur-Informationen
```

Die Datei `classes.dex` enthält den gesamten kompilierten Java- bzw. Kotlin-Code als Dalvik-Bytecode. Sie ist das primäre Analyseziel für Tools wie jadx-gui. Native Libraries im `lib/`-Verzeichnis hingegen sind ELF-Binärdateien, die mit IDA Pro oder Ghidra analysiert werden müssen. [2]

### 1.2 Die Dalvik Virtual Machine und ART

Android führt Java-Code nicht auf einer Standard-JVM aus, sondern auf der Dalvik Virtual Machine (DVM) bzw. deren Nachfolger Android Runtime (ART). Dalvik verwendet ein registerbasiertes Bytecode-Format (im Gegensatz zur stackbasierten JVM), was sich direkt auf das Aussehen von Smali-Code auswirkt. [3]

Der Kompilierungspfad eines Android-Programms lautet:

```
Java/Kotlin-Quellcode
        ↓ (javac / kotlinc)
    .class-Dateien (JVM-Bytecode)
        ↓ (d8 / dextools)
    classes.dex (Dalvik-Bytecode)
        ↓ (baksmali)
    .smali-Dateien (lesbares Assembly)
```

Für den Reverse Engineer bedeutet dies: jadx-gui versucht, den Dalvik-Bytecode zurück in Java zu übersetzen (Decompilation), während baksmali/apktool ihn in das lesbare Smali-Assembler-Format umwandelt (Disassembly).

### 1.3 Java Native Interface (JNI) und Native Libraries

Viele Apps, insbesondere sicherheitskritische oder rechenintensive, lagern Teile ihrer Logik in native C/C++-Code aus. Diese Verbindung zwischen Java und nativem Code erfolgt über das **Java Native Interface (JNI)**. [4]

Eine Java-Methode, die nativ implementiert ist, sieht im Java-Code so aus:

```java
public native String checkLicense(String key);
```

Die tatsächliche Implementierung befindet sich in einer `.so`-Datei. Die Verknüpfung erfolgt entweder durch **Dynamic Linking** (Funktionsname folgt dem Schema `Java_<paket>_<klasse>_<methode>`) oder durch **Static Linking** via `RegisterNatives` in `JNI_OnLoad`. [4]

| Aspekt | Dynamic Linking | Static Linking |
|--------|----------------|----------------|
| Funktionsname | `Java_com_example_MainActivity_check` | Beliebig (z.B. `sub_1234`) |
| Erkennbarkeit | Sofort im Exports-Tab sichtbar | Nur über `JNI_OnLoad` → `RegisterNatives` |
| Häufigkeit in CTFs | Häufig bei einfachen Challenges | Häufig bei obfuskierten Apps |
| IDA-Workflow | Direkt analysieren | `JNI_OnLoad` finden → Struct auflösen |

---

## 2. Der CTF-Workflow: Methodischer Ansatz

### 2.1 Phasenmodell für Android CTF-Challenges

Ein strukturierter Ansatz ist entscheidend, um Zeit nicht mit ineffizienten Suchstrategien zu verschwenden. Der folgende Workflow hat sich in der Praxis bewährt: [5]

**Phase 1 – Reconnaissance (Aufklärung)**

Bevor ein einziges Tool gestartet wird, sollte die APK-Struktur mit einfachen Mitteln untersucht werden. `unzip -l target.apk` zeigt alle enthaltenen Dateien und gibt sofort Hinweise: Gibt es native Libraries? Mehrere DEX-Dateien? Auffällige Dateien in `assets/`?

**Phase 2 – Statische Analyse**

jadx-gui ist der erste Anlaufpunkt für die Java-Ebene. Das Ziel ist es, die Applikationslogik zu verstehen, Einstiegspunkte zu identifizieren und relevante Code-Stellen zu finden, bevor dynamische Analyse betrieben wird. Statische Analyse gibt die Karte; dynamische Analyse prüft, ob die Karte korrekt ist. [6]

**Phase 3 – Dynamische Analyse**

Frida ermöglicht es, Methoden zur Laufzeit zu hooking, Rückgabewerte zu manipulieren und Laufzeitwerte zu extrahieren. Diese Phase baut auf den Erkenntnissen der statischen Analyse auf.

**Phase 4 – Patching (falls erforderlich)**

Wenn Frida-Hooks nicht ausreichen oder ein dauerhafter Patch benötigt wird, kommt Smali-Patching via apktool zum Einsatz. Die APK wird dekompiliert, der Smali-Code modifiziert, neu kompiliert und signiert.

**Phase 5 – Native Code-Analyse**

Enthält die App native Libraries, wird IDA Pro (oder Ghidra) für die Disassembly und Decompilation der `.so`-Dateien verwendet. Frida kann auch hier für Native Hooks eingesetzt werden.

### 2.2 Erste Schritte: APK-Extraktion und Umgebung

```bash
# APK von installierter App extrahieren
adb shell pm list packages | grep -i zielapp
adb shell pm path com.beispiel.app
adb pull /data/app/com.beispiel.app-1/base.apk target.apk

# APK-Struktur inspizieren
unzip -l target.apk

# Native Libraries extrahieren
unzip -j target.apk "lib/arm64-v8a/*" -d native_libs/

# Strings aus nativer Library extrahieren (schnelle Voranalyse)
strings native_libs/libnative.so | grep -i "flag\|key\|secret\|pass"
```

### 2.3 Entscheidungsbaum: Welches Tool wann?

![CTF-Workflow-Entscheidungsbaum](https://d21g8wfdqviqnd.cloudfront.net/session_files/208220161/3J2cj3jTI3ZUlHEEXUKXMplfWTu/3J2db1Z32IYzSnPnRnWjTAnWeBb/v1_3J2dazg0LKBnryFcvQ9ndUh2wB0.png?Expires=1804415197&Signature=BbSuHxZdGiOHgwYMJ0X~afuh6sXtvuB4Pg7aa61JPpfit5bzYGPYsZoHqL5vFIiUCyhuQRE4do6GQKpznrbUq2rNFbiQMno3W8uVG0FeXYl9ndMSuQfx1xp4zK2uTBBje65jpZIEzELyiDO-OQn41JA-83-hVmB1050pz4-0pYUijFeXcnHeB~NDPd7qtK5qYHu9k3JdY7YsNu-M-gNVc3xXr2~Lodn1qIQrCQqNghSpS8Rd9bcvdODO7kxANcWlk~XZtjslSfsqKjg9U68UvxDUFGZqX-ArMWF9M-CYBP3RE6AtE7yR1KlwWSTkotmGpMV1RKM7~nAEZ6UhdvMCYg__&Key-Pair-Id=KEP1XOZE0NGIV)

---

## 3. jadx-gui: Statische Java-Analyse

### 3.1 Überblick und Stärken

jadx-gui ist der De-facto-Standard für die statische Analyse von Android-APKs in CTF-Challenges. Es handelt sich um einen Open-Source-Decompiler, der DEX-Bytecode direkt in lesbaren Java-Quellcode umwandelt, ohne den Umweg über `.class`-Dateien zu nehmen. [7]

> **Kernstärke:** jadx-gui kombiniert Decompilation, Navigation, Suche und Cross-Reference-Analyse in einer einzigen IDE-ähnlichen Oberfläche und ist damit der schnellste Weg zu lesbarem Java-Code.

Die wichtigsten Eigenschaften im Überblick:

| Feature | Beschreibung | CTF-Relevanz |
|---------|-------------|--------------|
| DEX → Java Decompilation | Direkte Umwandlung ohne Zwischenschritte | Sehr hoch |
| GUI mit Syntax-Highlighting | IDE-ähnliche Oberfläche | Sehr hoch |
| Cross-References (Xrefs) | Zeigt alle Verwendungsstellen einer Methode/Klasse | Sehr hoch |
| Globale Textsuche | Suche über alle Klassen und Strings | Sehr hoch |
| Deobfuskation | Automatisches Umbenennen von obfuskierten Namen | Hoch |
| Smali-Ansicht | Wechsel zwischen Java und Smali | Mittel |
| AndroidManifest.xml | Automatisch dekodiert und lesbar | Hoch |
| Export als Java-Quellcode | Für externe Grep-Suchen | Mittel |

### 3.2 Installation und Start

```bash
# Aktuelle Version von GitHub herunterladen
wget https://github.com/skylot/jadx/releases/latest/download/jadx-1.x.x.zip
unzip jadx-1.x.x.zip -d jadx/

# GUI starten
./jadx/bin/jadx-gui target.apk

# Kommandozeilen-Export (für Grep-Suchen)
./jadx/bin/jadx -d output_dir target.apk
```

### 3.3 Der CTF-Workflow in jadx-gui

**Schritt 1: AndroidManifest.xml analysieren**

Das Manifest ist immer der erste Anlaufpunkt. Es listet alle `<activity>`, `<service>`, `<receiver>` und `<provider>` auf – das sind die Einstiegspunkte der App. Auch Permissions geben Hinweise auf die Funktionalität (z.B. `INTERNET`, `READ_EXTERNAL_STORAGE`). [8]

```xml
<!-- Beispiel: Relevante Einträge im Manifest -->
<activity android:name="com.ctf.challenge.MainActivity">
    <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
    </intent-filter>
</activity>
<activity android:name="com.ctf.challenge.FlagActivity"/>
```

**Schritt 2: Globale Suche nach relevanten Strings**

Die Tastenkombination **Strg+Shift+F** öffnet die globale Suche. Typische Suchbegriffe in CTFs:

- `flag`, `FLAG`, `CTF{`, `picoCTF{`, `DUCTF{`
- `password`, `passwd`, `secret`, `key`, `token`
- `Base64`, `AES`, `encrypt`, `decrypt`, `hash`
- `check`, `verify`, `validate`
- Bekannte API-Endpunkte oder URLs

**Schritt 3: Cross-References nutzen**

Cross-References sind eines der mächtigsten Features von jadx-gui. Durch Rechtsklick auf eine Methode oder Klasse → **"Find Usage"** (oder **X**-Taste) werden alle Stellen angezeigt, an denen diese Methode aufgerufen wird. Dies ist besonders wertvoll, wenn eine Methode wie `checkFlag()` gefunden wurde und man verstehen möchte, von wo sie aufgerufen wird und welche Parameter übergeben werden. [9]

**Schritt 4: Obfuskierten Code navigieren**

Viele CTF-Apps verwenden ProGuard oder R8 zur Obfuskation, was zu Klassen- und Methodennamen wie `a`, `b`, `c` führt. Die Strategie hier ist:

1. Im `AndroidManifest.xml` nach nicht-obfuskierten Einstiegspunkten suchen (Activity-Namen bleiben oft erhalten)
2. Von diesen Einstiegspunkten aus den Kontrollfluss verfolgen
3. Methoden und Klassen in jadx-gui umbenennen (Rechtsklick → **Rename** oder **N**-Taste), um die Analyse zu dokumentieren
4. Die Deobfuskations-Funktion aktivieren: **Tools → Deobfuscation**

**Schritt 5: Smali-Ansicht für Detailanalyse**

Wenn der decompilierte Java-Code unklar oder fehlerhaft ist (was bei komplexem Kotlin-Code oder Compiler-Optimierungen vorkommen kann), bietet jadx-gui einen direkten Wechsel zur Smali-Ansicht. Dies ist besonders hilfreich, wenn man den exakten Bytecode verstehen muss, bevor man einen Smali-Patch schreibt.

### 3.4 Praktisches Beispiel: Flag-Extraktion

Ein typisches CTF-Muster ist eine hartcodierte Flag, die durch eine einfache Verschleierungstechnik versteckt wird:

```java
// Decompilierter Code (jadx-gui Ausgabe)
public class MainActivity extends AppCompatActivity {
    private static final String ENCODED = "ZmxhZ3tqYWR4X2lzX2dyZWF0fQ==";
    
    private boolean checkInput(String userInput) {
        String decoded = new String(Base64.decode(ENCODED, 0));
        return userInput.equals(decoded);
    }
}
```

In jadx-gui ist `ENCODED` sofort als Base64-String erkennbar. Der Wert kann direkt dekodiert werden: `echo "ZmxhZ3tqYWR4X2lzX2dyZWF0fQ==" | base64 -d` ergibt `flag{jadx_is_great}`.

### 3.5 Häufige Fallstricke und Lösungen

**Problem: Kotlin-Code erzeugt unlesbaren Decompiler-Output**

Kotlin-Coroutines, Lambda-Ausdrücke und Companion Objects erzeugen nach der Kompilierung viel synthetischen Code, der in jadx-gui schwer lesbar ist. Die Lösung ist, sich auf die Kernlogik zu konzentrieren und Kotlin-Boilerplate (wie `IntrinsicsKt.getCOROUTINE_SUSPENDED()` oder `ResultKt.throwOnFailure()`) zu ignorieren. [10]

**Problem: `// Can't decompile method` Fehler**

Manchmal kann jadx-gui bestimmte Methoden nicht decompilieren. In diesem Fall hilft der Wechsel zur Smali-Ansicht oder das Ausprobieren alternativer Decompiler wie Procyon oder CFR.

**Problem: Mehrere DEX-Dateien (Multidex)**

Moderne Apps mit vielen Abhängigkeiten nutzen Multidex (`classes.dex`, `classes2.dex`, etc.). jadx-gui lädt alle automatisch, aber bei der Kommandozeilen-Nutzung müssen alle DEX-Dateien explizit angegeben oder die gesamte APK übergeben werden.

---

## 4. Dalvik und Smali: Bytecode-Ebene

### 4.1 Warum Smali verstehen?

Smali ist die menschenlesbare Assembler-Darstellung des Dalvik-Bytecodes. Während jadx-gui eine High-Level-Java-Ansicht bietet, ermöglicht Smali präzise, chirurgische Eingriffe in die App-Logik. Es gibt Situationen, in denen Smali-Patching die einzige oder effizienteste Lösung ist: [11]

- Wenn der Decompiler fehlerhafte oder unvollständige Java-Ausgabe liefert
- Wenn ein dauerhafter Patch ohne Frida benötigt wird
- Wenn einzelne Opcodes geändert werden müssen (z.B. Bedingungssprünge invertieren)
- Wenn neue Methoden oder Klassen eingefügt werden sollen

### 4.2 Das Dalvik-Registersystem

Im Gegensatz zur stackbasierten JVM ist Dalvik **registerbasiert**. Jede Methode hat eine feste Anzahl von 32-Bit-Registern, die explizit deklariert werden müssen. [12]

```smali
.method public checkPassword(Ljava/lang/String;)Z
    .registers 4    # Gesamtanzahl: p0 (this), p1 (String), v0, v1

    # Alternativ mit .locals:
    .locals 2       # Nur lokale Register (v0, v1); Parameter werden automatisch gezählt
```

Die Konvention ist folgende: Parameter-Register beginnen am Ende des Register-Pools. Bei einer nicht-statischen Methode mit 4 Registern gesamt und 1 Parameter gilt:
- `v0`, `v1` = lokale Register
- `p0` = `this` (Instanzreferenz)
- `p1` = erster Parameter

Für 64-Bit-Werte (long, double) werden zwei aufeinanderfolgende Register verwendet.

### 4.3 Smali-Datentypen und Signaturen

Das Typsystem in Smali folgt den JNI-Typ-Signaturen. Diese Signaturen erscheinen überall in Smali-Code und müssen verstanden werden, um Methoden-Aufrufe korrekt zu lesen: [13]

| Java-Typ | Smali-Notation | Beispiel |
|----------|---------------|---------|
| `boolean` | `Z` | `Z` |
| `byte` | `B` | `B` |
| `char` | `C` | `C` |
| `short` | `S` | `S` |
| `int` | `I` | `I` |
| `long` | `J` | `J` |
| `float` | `F` | `F` |
| `double` | `D` | `D` |
| `void` | `V` | `V` |
| Klasse | `Lfully/qualified/Name;` | `Ljava/lang/String;` |
| Array | `[type` | `[I` (int[]) |

Eine Methoden-Signatur hat die Form `(Parametertypen)Rückgabetyp`. Beispiel: `(Ljava/lang/String;I)Z` bedeutet: nimmt einen `String` und ein `int`, gibt `boolean` zurück.

### 4.4 Wichtige Dalvik-Opcodes

Die folgende Tabelle enthält die in CTF-Challenges am häufigsten relevanten Opcodes: [14]

| Opcode | Bedeutung | Beispiel |
|--------|-----------|---------|
| `const/4` | Kleine Konstante laden (4-Bit) | `const/4 v0, 0x1` |
| `const/16` | 16-Bit-Konstante | `const/16 v0, 0x2a` |
| `const-string` | String-Konstante laden | `const-string v0, "hello"` |
| `move` | Register kopieren | `move v0, v1` |
| `move-result` | Rückgabewert speichern | `move-result v0` |
| `return-void` | Void-Rückgabe | `return-void` |
| `return` | Wert zurückgeben | `return v0` |
| `invoke-virtual` | Virtuelle Methode aufrufen | `invoke-virtual {v0, v1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z` |
| `invoke-static` | Statische Methode aufrufen | `invoke-static {v0}, Ljava/lang/Integer;->parseInt(Ljava/lang/String;)I` |
| `invoke-direct` | Konstruktor/private Methode | `invoke-direct {v0}, Ljava/lang/Object;-><init>()V` |
| `if-eqz` | Sprung wenn == 0 | `if-eqz v0, :label_false` |
| `if-nez` | Sprung wenn != 0 | `if-nez v0, :label_true` |
| `if-eq` | Sprung wenn gleich | `if-eq v0, v1, :label` |
| `if-ne` | Sprung wenn ungleich | `if-ne v0, v1, :label` |
| `if-lt` | Sprung wenn kleiner | `if-lt v0, v1, :label` |
| `iget` | Instanzfeld lesen | `iget v0, p0, Lcom/example/Class;->field:I` |
| `iput` | Instanzfeld schreiben | `iput v0, p0, Lcom/example/Class;->field:I` |
| `sget-object` | Statisches Objekt-Feld lesen | `sget-object v0, Ljava/lang/System;->out:Ljava/io/PrintStream;` |
| `new-instance` | Neues Objekt erstellen | `new-instance v0, Ljava/lang/StringBuilder;` |
| `add-int` | Integer-Addition | `add-int v0, v1, v2` |
| `xor-int` | XOR-Operation | `xor-int v0, v1, v2` |

### 4.5 Der Smali-Patching-Workflow

Das Patchen einer APK via Smali ist ein mehrstufiger Prozess, der Präzision erfordert: [15]

**Schritt 1: APK dekompilieren**

```bash
apktool d target.apk -o output/
# Erzeugt:
# output/smali/          ← Smali-Quellcode
# output/res/            ← Dekodierte Ressourcen
# output/AndroidManifest.xml
```

**Schritt 2: Relevante Smali-Datei finden und bearbeiten**

Die Smali-Dateien spiegeln die Package-Struktur wider. `com.example.MainActivity` befindet sich in `output/smali/com/example/MainActivity.smali`.

**Schritt 3: Typische Patches**

*Boolean-Check invertieren (häufigster CTF-Patch):*

```smali
# Vorher: if-eqz prüft ob Passwort FALSCH ist → springt zu Fehler
if-eqz v0, :cond_fail

# Nachher: Bedingung invertiert → springt immer zum Erfolg
if-nez v0, :cond_fail
```

*Rückgabewert einer Methode erzwingen:*

```smali
# Vorher: komplexe Prüflogik
...
return v0

# Nachher: immer true (0x1) zurückgeben
const/4 v0, 0x1
return v0
```

*String-Konstante ändern:*

```smali
# Vorher
const-string v0, "wrong_password"

# Nachher
const-string v0, "correct_password"
```

**Schritt 4: APK neu bauen und signieren**

```bash
# APK neu kompilieren
apktool b output/ -o patched_unsigned.apk

# Debug-Keystore erstellen (einmalig)
keytool -genkey -v -keystore debug.keystore -alias debug \
        -keyalg RSA -keysize 2048 -validity 10000 \
        -dname "CN=Debug, OU=Debug, O=Debug, L=Debug, S=Debug, C=US"

# APK signieren (apksigner aus Android SDK Build Tools)
apksigner sign --ks debug.keystore --ks-pass pass:android \
               --out patched.apk patched_unsigned.apk

# Installieren
adb install patched.apk
```

### 4.6 Smali-Beispiel: Vollständige Analyse

Das folgende Beispiel zeigt eine typische CTF-Situation: Eine Login-Prüfung soll bypassed werden.

```java
// Original Java (jadx-gui Ausgabe)
public boolean verifyPin(String input) {
    return input.equals("1337");
}
```

```smali
# Entsprechender Smali-Code
.method public verifyPin(Ljava/lang/String;)Z
    .locals 1

    const-string v0, "1337"

    invoke-virtual {p1, v0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v0

    return v0
.end method
```

Um diese Methode zu patchen, sodass sie immer `true` zurückgibt:

```smali
# Gepatchter Smali-Code
.method public verifyPin(Ljava/lang/String;)Z
    .locals 1

    const/4 v0, 0x1    # true = 1

    return v0
.end method
```

---

## 5. Frida: Dynamische Instrumentierung

### 5.1 Architektur und Funktionsprinzip

Frida ist ein dynamisches Instrumentierungs-Framework, das JavaScript-Code in laufende Prozesse injiziert. Die Architektur folgt einem Client-Server-Modell: Der **frida-server** läuft auf dem Android-Gerät (Root erforderlich), der **frida-client** (Python-Tools) auf dem Analyse-PC. [16]

> **Kernprinzip:** Frida nutzt `ptrace`, um einen Thread im Zielprozess zu hijacken, injiziert eine dynamisch generierte Library mit dem Frida-Agent und dem QuickJS-Engine, und stellt dann eine bidirektionale Kommunikation zwischen dem JavaScript-Hook und dem Python-Client her.

Der entscheidende Vorteil gegenüber Smali-Patching: Frida-Hooks sind **nicht-persistent** und können **live angepasst** werden, ohne die APK neu zu kompilieren und zu signieren. Dies macht Frida zum bevorzugten Tool für explorative Analyse.

### 5.2 Setup und Umgebung

```bash
# Frida-Tools auf dem PC installieren
pip install frida-tools

# Passende frida-server-Version herunterladen
# (Architektur des Geräts prüfen: adb shell getprop ro.product.cpu.abi)
# Download von: https://github.com/frida/frida/releases

# frida-server auf Gerät übertragen und starten
adb push frida-server-xx.x.x-android-arm64 /data/local/tmp/frida-server
adb shell chmod +x /data/local/tmp/frida-server
adb shell /data/local/tmp/frida-server &

# Verbindung testen
frida-ps -Uai    # Alle installierten Apps auflisten
```

**Wichtig:** Die Version von frida-server und frida-tools auf dem PC muss exakt übereinstimmen. Versionsunterschiede führen zu Verbindungsfehlern.

### 5.3 Frida starten: Spawn vs. Attach

```bash
# App spawnen (startet App neu mit Frida von Beginn an)
# → Notwendig für Early Instrumentation (z.B. Checks im Konstruktor)
frida -U -f com.ctf.challenge -l hook.js --no-pause

# An laufende App anhängen
# → Schneller, aber verpasst Initialisierungsphase
frida -U com.ctf.challenge -l hook.js

# Interaktive REPL (ohne Script-Datei)
frida -U com.ctf.challenge
```

### 5.4 Java-Hooks: Die Kernfunktionen

Alle Java-Hooks müssen innerhalb von `Java.perform()` ausgeführt werden, da dieser Aufruf sicherstellt, dass der Frida-Agent korrekt mit der Dalvik/ART-VM verbunden ist. [17]

**Methoden-Implementation ersetzen:**

```javascript
Java.perform(function() {
    // Einfacher Boolean-Bypass
    var MainActivity = Java.use("com.ctf.challenge.MainActivity");
    MainActivity.checkFlag.implementation = function(input) {
        console.log("[*] checkFlag aufgerufen mit: " + input);
        return true;  // Immer true zurückgeben
    };
});
```

**Originale Methode aufrufen und Ergebnis loggen:**

```javascript
Java.perform(function() {
    var CryptoClass = Java.use("com.ctf.challenge.CryptoHelper");
    CryptoClass.decrypt.implementation = function(ciphertext, key) {
        var result = this.decrypt(ciphertext, key);  // Original aufrufen
        console.log("[*] Decrypt Input:  " + ciphertext);
        console.log("[*] Decrypt Key:    " + key);
        console.log("[*] Decrypt Output: " + result);
        return result;
    };
});
```

**Überladene Methoden (Overloads):**

```javascript
Java.perform(function() {
    var StringClass = Java.use("java.lang.String");
    // Spezifische Überladung auswählen
    StringClass.equals.overload("java.lang.Object").implementation = function(other) {
        console.log("[*] String.equals: " + this + " == " + other);
        return this.equals(other);
    };
});
```

**Konstruktor hooking:**

```javascript
Java.perform(function() {
    var SecretClass = Java.use("com.ctf.challenge.SecretManager");
    SecretClass.$init.implementation = function() {
        this.$init();  // Originalen Konstruktor aufrufen
        console.log("[*] SecretManager erstellt, secretKey: " + this.secretKey.value);
    };
});
```

**Klassen-Instanzen zur Laufzeit finden:**

```javascript
Java.perform(function() {
    // Alle existierenden Instanzen einer Klasse finden
    Java.choose("com.ctf.challenge.FlagHolder", {
        onMatch: function(instance) {
            console.log("[*] FlagHolder gefunden!");
            console.log("[*] flag: " + instance.flag.value);
        },
        onComplete: function() {
            console.log("[*] Suche abgeschlossen");
        }
    });
});
```

**Alle geladenen Klassen auflisten:**

```javascript
Java.perform(function() {
    Java.enumerateLoadedClasses({
        onMatch: function(className) {
            if (className.includes("ctf") || className.includes("flag")) {
                console.log("[*] Interessante Klasse: " + className);
            }
        },
        onComplete: function() {}
    });
});
```

### 5.5 Native Hooks: JNI und C/C++-Funktionen

Wenn die Logik in nativen Libraries implementiert ist, bietet Frida `Interceptor.attach()` für C-Level-Hooks. [18]

**Export by Name (Dynamic Linking):**

```javascript
// Funktion über Export-Namen hooking
Interceptor.attach(Module.findExportByName("libnative.so", "Java_com_ctf_challenge_NativeLib_checkKey"), {
    onEnter: function(args) {
        // args[0] = JNIEnv*, args[1] = jobject (this), args[2] = erster Java-Parameter
        console.log("[*] checkKey aufgerufen");
        // String aus JNI-Argument lesen
        var jstring = args[2];
        console.log("[*] Input: " + Java.vm.getEnv().getStringUtfChars(jstring, null).readCString());
    },
    onLeave: function(retval) {
        console.log("[*] Rückgabewert: " + retval.toInt32());
        retval.replace(1);  // true zurückgeben
    }
});
```

**Hook by Address (Static Linking oder obfuskierte Exports):**

```javascript
// Basisadresse der Library finden
var baseAddr = Module.findBaseAddress("libnative.so");
console.log("[*] Basisadresse: " + baseAddr);

// Funktion an bekanntem Offset hooking (aus IDA Pro ermittelt)
Interceptor.attach(baseAddr.add(0x1234), {
    onEnter: function(args) {
        console.log("[*] Funktion bei 0x1234 aufgerufen");
        console.log("[*] arg0: " + args[0].toInt32());
    },
    onLeave: function(retval) {
        retval.replace(ptr(1));
    }
});
```

**Alle Exports einer Library auflisten:**

```javascript
Module.enumerateExports("libnative.so", {
    onMatch: function(exp) {
        if (exp.type === "function") {
            console.log("[*] Export: " + exp.name + " @ " + exp.address);
        }
    },
    onComplete: function() {}
});
```

**Memory-Scanning nach Strings:**

```javascript
// Nach einem bekannten String im Speicher suchen
Memory.scan(Module.findBaseAddress("libnative.so"), 0x100000, "43 54 46 7B", {
    onMatch: function(address, size) {
        console.log("[*] 'CTF{' gefunden bei: " + address);
        console.log("[*] String: " + address.readCString());
    },
    onComplete: function() {}
});
```

### 5.6 Anti-Tamper-Bypässe

CTF-Challenges und reale Apps implementieren häufig Schutzmechanismen, die Frida-Analysen erschweren sollen. [19]

**Root Detection bypassen:**

```javascript
Java.perform(function() {
    // RootBeer-Library bypassen
    var RootBeer = Java.use("com.scottyab.rootbeer.RootBeer");
    RootBeer.isRooted.implementation = function() { return false; };
    RootBeer.isRootedWithoutBusyBoxCheck.implementation = function() { return false; };
    
    // Build.TAGS manipulieren
    var Build = Java.use("android.os.Build");
    Build.TAGS.value = "release-keys";
});
```

**SSL Pinning bypassen:**

```javascript
Java.perform(function() {
    // OkHttp3 CertificatePinner bypassen
    var CertificatePinner = Java.use("okhttp3.CertificatePinner");
    CertificatePinner.check.overload("java.lang.String", "java.util.List").implementation = function() {
        console.log("[*] SSL Pinning bypassed");
        return;  // Keine Exception werfen
    };
    
    // TrustManager ersetzen
    var TrustManager = Java.use("javax.net.ssl.X509TrustManager");
    // ... (komplexere Implementierung erforderlich)
});
```

**Frida-Erkennung umgehen:**

Manche Apps erkennen Frida durch Scanning nach `frida-agent` in `/proc/self/maps`. Dagegen helfen:
- `frida-gadget` statt `frida-server` (wird in die APK eingebettet)
- Obfuskierte Frida-Builds (z.B. `re.frida.server`)
- Magisk-Module wie `MagiskHide` oder `Shamiko`

### 5.7 Python-Bindings für Automatisierung

Für wiederholte oder automatisierte Analysen bieten sich Frida's Python-Bindings an:

```python
import frida
import sys

def on_message(message, data):
    if message['type'] == 'send':
        print(f"[*] {message['payload']}")
    elif message['type'] == 'error':
        print(f"[!] Fehler: {message['stack']}")

# JavaScript-Hook
js_code = """
Java.perform(function() {
    var MainActivity = Java.use("com.ctf.challenge.MainActivity");
    MainActivity.getFlag.implementation = function() {
        var flag = this.getFlag();
        send("Flag: " + flag);
        return flag;
    };
});
"""

# Early Instrumentation (App spawnen)
device = frida.get_usb_device()
pid = device.spawn(["com.ctf.challenge"])
session = device.attach(pid)
script = session.create_script(js_code)
script.on('message', on_message)
script.load()
device.resume(pid)
sys.stdin.read()
```

---

## 6. IDA Pro: Native Code und ARM-Analyse

### 6.1 Wann IDA Pro unerlässlich ist

IDA Pro ist das professionelle Werkzeug für die Analyse von nativem Code in Android-Apps. Es kommt zum Einsatz, wenn die App sicherheitskritische Logik in C/C++-Libraries ausgelagert hat – ein in CTF-Challenges zunehmend häufiges Muster. [20]

> **Kernstärke von IDA Pro:** Die Kombination aus ausgereifter statischer Analyse, dem Hex-Rays Decompiler (C-Pseudocode aus ARM-Assembly), einer persistenten Datenbank und einem umfangreichen Plugin-Ökosystem macht IDA Pro zur ersten Wahl für komplexe native Code-Analyse.

IDA Free (kostenlos) unterstützt x86/x64 und ARM/ARM64 für nicht-kommerzielle Nutzung und ist für die meisten CTF-Challenges ausreichend. IDA Pro (kommerziell) bietet zusätzlich Remote-Debugging und erweiterte Prozessorunterstützung.

### 6.2 Vorbereitung: Native Library extrahieren

```bash
# .so-Datei aus APK extrahieren
unzip -j target.apk "lib/arm64-v8a/libnative.so" -d ./

# Dateiformat prüfen
file libnative.so
# → ELF 64-bit LSB shared object, ARM aarch64

# Schnelle Voranalyse
strings libnative.so | grep -i "flag\|key\|secret\|ctf"
nm --demangle --dynamic libnative.so | grep -i "Java_"
readelf -s libnative.so | grep "FUNC"
```

### 6.3 IDA Pro Workflow: Schritt für Schritt

**Schritt 1: Datei laden und Auto-Analyse**

Beim Öffnen einer `.so`-Datei erkennt IDA Pro automatisch das ELF-Format und die Architektur (ARM64). Die Auto-Analyse (`Options → General → Analysis`) identifiziert Funktionen, Strings, Cross-References und bekannte Library-Funktionen via FLIRT-Signaturen. Diese Phase dauert je nach Dateigröße einige Sekunden bis Minuten.

**Schritt 2: JNI-Einstiegspunkte finden**

Der erste Anlaufpunkt ist der **Exports-Tab** (`View → Open subviews → Exports`). Bei Dynamic Linking sind JNI-Funktionen sofort erkennbar am Präfix `Java_`. Bei Static Linking muss `JNI_OnLoad` gefunden und der `RegisterNatives`-Aufruf analysiert werden:

```c
// Typische JNI_OnLoad Struktur (IDA Pseudocode)
jint JNI_OnLoad(JavaVM *vm, void *reserved) {
    JNIEnv *env;
    vm->GetEnv((void**)&env, JNI_VERSION_1_6);
    
    jclass clazz = env->FindClass("com/ctf/challenge/NativeLib");
    
    JNINativeMethod methods[] = {
        {"checkKey", "(Ljava/lang/String;)Z", (void*)sub_1234},
        {"getFlag",  "()Ljava/lang/String;",  (void*)sub_5678}
    };
    
    env->RegisterNatives(clazz, methods, 2);
    return JNI_VERSION_1_6;
}
```

**Schritt 3: Hex-Rays Decompiler nutzen**

Die Taste **F5** öffnet den Hex-Rays Decompiler und zeigt C-ähnlichen Pseudocode. Dies ist das mächtigste Feature von IDA Pro für CTF-Analysen, da es ARM-Assembly in lesbaren Code umwandelt:

```c
// Beispiel: Decompilierter Pseudocode einer Prüffunktion
jboolean Java_com_ctf_challenge_NativeLib_checkKey(JNIEnv *env, jobject thiz, jstring key) {
    const char *key_str = env->GetStringUTFChars(key, 0);
    
    // XOR-Verschlüsselung
    char expected[] = {0x43, 0x54, 0x46, 0x7B, 0x6E, 0x61, 0x74, 0x69, 0x76, 0x65, 0x7D};
    int len = strlen(key_str);
    
    if (len != 11) return 0;
    
    for (int i = 0; i < len; i++) {
        if ((key_str[i] ^ 0x00) != expected[i]) return 0;
    }
    
    env->ReleaseStringUTFChars(key, key_str);
    return 1;
}
```

**Schritt 4: Navigation und Analyse**

| Tastenkürzel | Funktion |
|-------------|----------|
| **F5** | Hex-Rays Decompiler öffnen |
| **N** | Funktion/Variable umbenennen |
| **Y** | Typ definieren/ändern |
| **X** | Cross-References anzeigen |
| **G** | Zu Adresse springen |
| **Space** | Graph-Ansicht ↔ Text-Ansicht |
| **Tab** | Zwischen Assembler und Pseudocode wechseln |
| **;** | Kommentar hinzufügen |
| **Ctrl+F** | Suchen |
| **Alt+T** | Text in Assembler suchen |
| **Ctrl+S** | Datenbank speichern |

**Schritt 5: Strukturen und Typen definieren**

Für komplexe Datenstrukturen (z.B. benutzerdefinierte Structs) kann IDA Pro Typ-Informationen manuell definieren. Dies verbessert den Decompiler-Output erheblich:

```c
// In IDA: Struct definieren (Structures-Tab oder Local Types)
struct FlagData {
    int length;
    char key[32];
    char encrypted_flag[64];
};
```

### 6.4 FLIRT-Signaturen: Bibliotheken automatisch erkennen

FLIRT (Fast Library Identification and Recognition Technology) ermöglicht es IDA Pro, bekannte Bibliotheksfunktionen automatisch zu erkennen und zu benennen. Dies ist besonders wertvoll bei statisch gelinkten Libraries, wo Funktionen wie `memcpy`, `strlen` oder OpenSSL-Funktionen sonst als anonyme `sub_XXXX`-Funktionen erscheinen würden. [21]

```
View → Open subviews → Signatures → Apply signatures
```

Für Android NDK-Bibliotheken gibt es Community-Signaturen auf GitHub (z.B. `FLIRTDB`). Das Anwenden dieser Signaturen kann die Analyse erheblich beschleunigen.

### 6.5 Remote-Debugging mit IDA Pro

IDA Pro unterstützt Remote-Debugging auf Android-Geräten über `android_server` (IDA's eigener Debug-Server):

```bash
# android_server auf Gerät übertragen
adb push android_server /data/local/tmp/
adb shell chmod +x /data/local/tmp/android_server
adb shell /data/local/tmp/android_server

# Port-Forwarding
adb forward tcp:23946 tcp:23946
```

In IDA Pro: `Debugger → Attach to process → Remote ARM Linux/Android debugger`. Dies ermöglicht dynamisches Debugging mit Breakpoints direkt in IDA Pro.

### 6.6 Typische CTF-Muster in nativem Code

**XOR-Verschlüsselung:**

```c
// Häufiges Muster: Flag ist XOR-verschlüsselt gespeichert
char encrypted[] = {0x26, 0x35, 0x27, 0x5e, ...};
char key = 0x42;
for (int i = 0; i < sizeof(encrypted); i++) {
    printf("%c", encrypted[i] ^ key);
}
```

**String-Vergleich mit Anti-Debug:**

```c
// Anti-Debug-Check vor dem eigentlichen Vergleich
if (ptrace(PTRACE_TRACEME, 0, 0, 0) == -1) {
    return 0;  // Debugger erkannt
}
return strcmp(input, "secret_flag") == 0;
```

**Custom VM / Obfuskation:**

Manche CTF-Challenges implementieren eine eigene virtuelle Maschine oder einen Interpreter in nativem Code. Hier ist es wichtig, den Dispatch-Loop zu identifizieren und die Opcode-Tabelle zu reverse-engineeren.

---

## 7. Tool-Kombination und fortgeschrittene Techniken

### 7.1 jadx-gui + Frida: Der klassische Workflow

Die häufigste und effektivste Kombination in Android CTFs ist jadx-gui für die statische Analyse gefolgt von Frida für die dynamische Verifikation und den Bypass. [22]

Der Workflow läuft typischerweise so ab:

1. **jadx-gui:** App-Logik verstehen, relevante Methoden identifizieren (z.B. `checkPassword`, `verifyLicense`)
2. **jadx-gui:** Exakten Klassennamen und Methodensignatur notieren (wichtig für Frida!)
3. **Frida:** Methode hooking, Argumente loggen, Rückgabewert manipulieren
4. **Frida:** Laufzeitwerte extrahieren (z.B. entschlüsselte Strings, generierte Keys)

**Kritischer Punkt:** Der in jadx-gui angezeigte Klassenname muss exakt mit dem in Frida verwendeten übereinstimmen, inklusive Package-Pfad. Bei obfuskierten Apps kann `Java.enumerateLoadedClasses()` helfen, den korrekten Namen zu finden.

### 7.2 IDA Pro + Frida: Native Code analysieren und hooking

Wenn IDA Pro die Logik einer nativen Funktion enthüllt hat, kann Frida genutzt werden, um diese Funktion zur Laufzeit zu manipulieren, ohne die APK zu modifizieren: [23]

```javascript
// IDA Pro hat gezeigt: Funktion bei Offset 0x2ABC in libnative.so
// prüft einen 4-Byte-Integer-Key
var baseAddr = Module.findBaseAddress("libnative.so");
var checkKeyAddr = baseAddr.add(0x2ABC);

Interceptor.attach(checkKeyAddr, {
    onEnter: function(args) {
        console.log("[*] Key-Check aufgerufen");
        // Ersten Parameter (Key) ausgeben
        console.log("[*] Key: " + args[0].toInt32());
    },
    onLeave: function(retval) {
        // Immer Erfolg zurückgeben
        retval.replace(1);
    }
});
```

### 7.3 ADB Logcat: Versteckte Debug-Informationen

Viele Apps, besonders in CTF-Challenges, loggen sensitive Informationen über `Log.d()` oder `System.out.println()`. Diese Ausgaben sind über ADB abrufbar und können direkt zur Flag führen: [24]

```bash
# Live-Logs streamen (ohne History)
adb logcat -T1

# Nach spezifischen Tags filtern
adb logcat -T1 | grep -i "flag\|ctf\|secret\|key"

# Tag einer spezifischen App filtern
adb logcat -T1 --pid=$(adb shell pidof com.ctf.challenge)
```

### 7.4 Obfuskation: Fortgeschrittene Strategien

**ProGuard/R8 Obfuskation:**

Bei stark obfuskierten Apps (alle Klassen heißen `a`, `b`, `c`) ist die Strategie:

1. **Einstiegspunkte aus Manifest nutzen:** Activity-Namen sind oft nicht obfuskiert
2. **String-Literale suchen:** Strings bleiben oft lesbar (API-Endpunkte, Fehlermeldungen)
3. **Bekannte Library-Klassen als Anker:** `okhttp3.OkHttpClient`, `retrofit2.Retrofit` etc. sind nicht obfuskiert
4. **Schrittweises Umbenennen:** In jadx-gui von bekannten Klassen ausgehend umbenennen

**String-Verschlüsselung:**

Manche Apps verschlüsseln alle String-Literale und entschlüsseln sie zur Laufzeit. Frida ist hier das ideale Werkzeug:

```javascript
Java.perform(function() {
    // Alle String-Entschlüsselungsaufrufe loggen
    var StringDecryptor = Java.use("com.obfuscated.a.b");
    StringDecryptor.a.overload("int").implementation = function(id) {
        var result = this.a(id);
        console.log("[*] Entschlüsselter String [" + id + "]: " + result);
        return result;
    };
});
```

### 7.5 Emulator-Setup für CTF-Analysen

Für eine reproduzierbare Analyseumgebung empfiehlt sich ein Android-Emulator:

```bash
# Android Virtual Device (AVD) mit Root-Zugriff erstellen
# Empfehlung: Android x86 Image (ohne Google Play) für Root-Zugriff

# Emulator starten
emulator -avd CTF_Device -writable-system

# Root-Zugriff aktivieren
adb root
adb remount

# Frida-Server für x86 übertragen
adb push frida-server-android-x86 /data/local/tmp/frida-server
```

**Empfohlene Emulator-Konfiguration für CTFs:**

| Einstellung | Empfehlung | Begründung |
|------------|-----------|-----------|
| Android-Version | Android 9-11 | Gute Frida-Unterstützung, weniger Restriktionen |
| Architektur | x86_64 | Schneller auf x86-Hosts, IDA Free unterstützt |
| Google Play | Ohne | Root-Zugriff einfacher |
| RAM | 2+ GB | Für flüssige Analyse |
| Snapshot | Aktiviert | Schnelles Zurücksetzen nach Patches |

---

## 8. Häufige CTF-Muster und Lösungsstrategien

### 8.1 Muster 1: Hartcodierte Flag

**Erkennungszeichen:** Flag oder Schlüssel direkt im Code oder in Ressourcen gespeichert.

**Lösung:** jadx-gui → Globale Suche nach `CTF{`, `flag`, `Base64`-Strings. Auch `strings.xml` in `res/values/` prüfen.

```java
// Typisches Beispiel
private static final String FLAG = "Q1RGe2hhcmRjb2RlZF9mbGFnfQ=="; // Base64
```

### 8.2 Muster 2: Einfacher String-Vergleich

**Erkennungszeichen:** `equals()`, `compareTo()`, `Arrays.equals()` mit einem festen Wert.

**Lösung:** Frida-Hook auf die Vergleichsmethode, um beide Seiten zu loggen:

```javascript
Java.perform(function() {
    var String = Java.use("java.lang.String");
    String.equals.implementation = function(other) {
        var result = this.equals(other);
        if (!result) {
            console.log("[*] Vergleich: '" + this + "' == '" + other + "' → " + result);
        }
        return result;
    };
});
```

### 8.3 Muster 3: Kryptographische Prüfung

**Erkennungszeichen:** `MessageDigest` (MD5/SHA), `Cipher` (AES/DES), `Mac` (HMAC).

**Lösung:** Frida-Hook auf den Krypto-Aufruf, um Input und Output zu extrahieren:

```javascript
Java.perform(function() {
    var MessageDigest = Java.use("java.security.MessageDigest");
    MessageDigest.digest.overload("[B").implementation = function(input) {
        var result = this.digest(input);
        console.log("[*] Hash Input:  " + bytesToHex(input));
        console.log("[*] Hash Output: " + bytesToHex(result));
        return result;
    };
    
    function bytesToHex(bytes) {
        var hex = [];
        for (var i = 0; i < bytes.length; i++) {
            hex.push(('0' + (bytes[i] & 0xFF).toString(16)).slice(-2));
        }
        return hex.join('');
    }
});
```

### 8.4 Muster 4: Native Flag-Prüfung

**Erkennungszeichen:** `System.loadLibrary()` im Java-Code, native Methoden-Deklarationen.

**Lösung:** IDA Pro für Algorithmus-Analyse, dann entweder Algorithmus nachimplementieren oder Frida Native Hook:

```bash
# 1. Library extrahieren
unzip -j target.apk "lib/arm64-v8a/libnative.so"

# 2. In IDA Pro öffnen, JNI-Funktion finden (F5 für Pseudocode)

# 3. Frida-Hook schreiben basierend auf IDA-Analyse
```

### 8.5 Muster 5: Anti-Debug und Schutzmaßnahmen

**Erkennungszeichen:** `ptrace(PTRACE_TRACEME)`, `Debug.isDebuggerConnected()`, Frida-Erkennung.

**Lösung:** Die Schutzmaßnahmen müssen vor der eigentlichen Analyse bypassed werden:

```javascript
Java.perform(function() {
    // Android Debug-Erkennung bypassen
    var Debug = Java.use("android.os.Debug");
    Debug.isDebuggerConnected.implementation = function() { return false; };
    
    // SafetyNet bypassen (falls vorhanden)
    // ... (komplexer, app-spezifisch)
});
```

### 8.6 Muster 6: Versteckte Activities und Intents

**Erkennungszeichen:** Activities im Manifest, die nicht über die normale UI erreichbar sind.

**Lösung:** Activity direkt per ADB starten:

```bash
# Versteckte Activity direkt starten
adb shell am start -n com.ctf.challenge/.HiddenFlagActivity

# Mit Intent-Extra
adb shell am start -n com.ctf.challenge/.FlagActivity \
    --es "secret_key" "admin" --ez "debug_mode" true
```

### 8.7 Schnell-Referenz: Tool-Auswahl

| Situation | Primäres Tool | Sekundäres Tool |
|-----------|--------------|----------------|
| Java-Code lesen | jadx-gui | — |
| Strings/Konstanten suchen | jadx-gui (Strg+Shift+F) | `strings` + `grep` |
| Boolean-Check bypassen | Frida | Smali-Patch (apktool) |
| Laufzeitwerte extrahieren | Frida | ADB Logcat |
| Native Code analysieren | IDA Pro | Ghidra (kostenlos) |
| Native Funktion bypassen | Frida (Interceptor) | IDA Remote Debug |
| APK dauerhaft patchen | apktool + Smali | — |
| Anti-Debug bypassen | Frida | Smali-Patch |
| SSL Pinning bypassen | Frida | apktool (Network Config) |
| Obfuskierten Code navigieren | jadx-gui (Rename) | Frida (Class Enum) |

---

## Referenzen

[1]: https://developer.android.com/guide/components/fundamentals "Android Application Fundamentals – Android Developers"
[2]: https://www.marginaldeer.com/blog/apk-reverse-engineering-workflow/ "From APK to Source: Complete Android Reverse Engineering Workflow"
[3]: https://source.android.com/docs/core/runtime/dalvik-bytecode "Dalvik Bytecode Format – Android Open Source Project"
[4]: https://www.ragingrock.com/AndroidAppRE/reversing_native_libs.html "Reverse Engineering Android Apps – Native Libraries"
[5]: https://httptoolkit.com/blog/android-reverse-engineering/ "Reverse Engineering & Modifying Android Apps with JADX & Frida"
[6]: https://nusgreyhats.org/posts/writeups/introduction-to-android-app-reversing/ "Introduction to Android App Reversing – NUS Greyhats"
[7]: https://github.com/skylot/jadx "skylot/jadx: Dex to Java decompiler – GitHub"
[8]: https://blog.ikuamike.io/posts/2024/nahamcon_ctf_2024_mobile/ "NahamCon CTF 2024 WriteUp – Mobile"
[9]: https://appsecsanta.com/jadx "Jadx – Free Android APK Decompiler"
[10]: https://httptoolkit.com/blog/android-reverse-engineering/ "Reverse Engineering & Modifying Android Apps with JADX & Frida"
[11]: https://payatu.com/blog/an-introduction-to-smali/ "An Introduction to Smali – Payatu"
[12]: https://source.android.com/docs/core/runtime/dalvik-bytecode "Dalvik Bytecode Format – Android Open Source Project"
[13]: https://docs.oracle.com/javase/8/docs/technotes/guides/jni/spec/types.html "JNI Type Signatures – Oracle"
[14]: http://pallergabor.uw.hu/androidblog/dalvik_opcodes.html "Dalvik Opcodes – pallergabor"
[15]: https://hackmag.com/mobile/android-smali "Reverse Engineering Android Apps with Smali – HackMag"
[16]: https://frida.re/docs/android/ "Frida Android Documentation – frida.re"
[17]: https://erev0s.com/blog/frida-code-snippets-for-android/ "Frida Cheatsheet and Code Snippets for Android – erev0s.com"
[18]: https://www.redfoxsec.com/blog/exploring-native-modules-in-android-with-frida "Exploring Native Modules in Android with Frida – RedFoxSec"
[19]: https://braincoke.fr/blog/2021/03/android-reverse-engineering-for-beginners-frida/ "Android Reverse Engineering for Beginners – Frida – Braincoke"
[20]: https://yarygintech.com/articles/popular-reverse-engineering-tools/ "Popular Reverse Engineering Tools: IDA Pro, Ghidra, Frida, JADX – Dmitry Yarygin Tech"
[21]: https://hex-rays.com/blog/unveiling-ida-pro-9-0-introducing-the-flirt-manager-and-thousands-of-new-signatures "Unveiling IDA Pro 9.0: FLIRT Manager – Hex-Rays"
[22]: https://medium.com/@prathunan777/reverse-engineering-android-apps-ctf-challenge-baa3a9cbe7d5 "Reverse Engineering Android Apps – CTF Challenge – Medium"
[23]: https://codeshare.frida.re/@salecharohit/instrumenting-native-android-functions-using-frida/ "Instrumenting Native Android Functions using Frida – Frida CodeShare"
[24]: https://developer.android.com/studio/command-line/adb "Android Debug Bridge (ADB) – Android Developers"
