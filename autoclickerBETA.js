// ==UserScript==
// @name         TW Auto-Action (Hotkey & Externe Trigger)
// @namespace    TribalWars
// @version      3.9 // Offizielle Version 3.9
// @description  Klickt den ersten FarmGod Button (A oder B) in zufälligem Intervall. Start/Stop per Tastenkombination (Standard: Shift+Strg+E) oder durch Aufruf von window.toggleTribalAutoAction(). Einstellungs-Button auf der Farm-Seite. Inkl. Farms/Min, Restlaufzeit und Changelog.
// @author       Idee PhilJor93 Generiert mit Google Gemini-KI
// @match        https://*.die-staemme.de/game.php?*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // *** AGGRESSIVER SCHUTZ VOR MEHRFACHAUSFÜHRUNG ***
    if (window.TW_AUTO_ENTER_INITIALIZED_MARKER === true) {
        return;
    }
    window.TW_AUTO_ENTER_INITIALIZED_MARKER = true;

    const SCRIPT_VERSION = '3.9'; // Die aktuelle Version des Skripts (Offizielles Release)

    // Speichert den ursprünglichen Titel des Dokuments
    const originalDocumentTitle = document.title;

    // --- Alle Changelog-Einträge (die vollständige Historie) ---
    const ALL_CHANGELOG_ENTRIES = [
        `v3.9 (2025-08-01):
    - NEU: Die **Restlaufzeit-Anzeige** der Farms wurde komplett überarbeitet und ist jetzt wieder verfügbar. 
    - VERBESSERUNG: Die Messung der **Farms pro Minute (FpM)** ist durch eine neue Logik deutlich genauer geworden.
    
        `v3.8.0 (2025-08-01):
    - FIX: Behebung eines Fehlers, der dazu führte, dass das Skript manchmal nach dem ersten Klick nicht mehr korrekt das Intervall neu startete. Dies stellt die zuverlässige Fortsetzung der Klicks sicher.
    - REINIGUNG: Entfernung alter, nicht mehr benötigter Variablen und Konsolen-Logs.`,

        `v3.7.2 (2025-08-01):
    - Changelog-Button im Einstellungsdialog verkleinert und direkt neben der Version platziert.`,

        `v3.7.1 (2025-08-01):
    - Anzeige des Changelogs (Pop-up und manuell) auf die letzten 5 Versionen begrenzt.`,

        `v3.7.0 (2025-08-01):
    - NEU: "Changelog anzeigen"-Button im Einstellungsdialog für manuelles Einsehen.`,

        `v3.6.1 (2025-08-01):
    - Anzeige des Changelogs im Alert auf die aktuelle und letzte Version gekürzt.`,

        `v3.6.0 (2025-08-01):
    - NEU: Changelog-Anzeige beim ersten Laden einer neuen Version.
    - Kleinere interne Optimierungen.`,

        `v3.5.0 (2025-07-31):
    - NEU: Anzeige der "Farms pro Minute" in der Statusleiste.
    - Verbesserte Logik für die Farms/Min-Berechnung.`,

        `v3.4.3 (2025-07-30):
    - FIX: Start-Ton respektiert nun die Einstellung "Botschutz-Ton abspielen".`,

        `v3.4.2 (2025-07-29):
    - FIX: Verbesserte Botschutz-Erkennung für mehr Szenarien.
    - Verbesserte Stabilität beim Starten/Stoppen des Skripts.`,

        `v3.4.1 (2025-07-28):
    - FIX: Fehlerbehebung bei der Erkennung von Farm-Buttons auf bestimmten Seitenlayouts.`,

        `v3.4.0 (2025-07-27):
    - NEU: Einstellungsdialog für Hotkey, Intervalle, Botschutz-Verhalten und Sound.
    - NEU: Sound-Benachrichtigung bei Botschutz-Erkennung (konfigurierbar).
    - NEU: Globale Funktion window.toggleTribalAutoAction() zur externen Steuerung.
    - Überarbeitung der UI-Elemente für bessere Integration.`,

        `v3.3.0 (2025-07-26):
    - NEU: Hotkey-Unterstützung (Standard: Shift+Strg+E) zum Starten/Stoppen.
    - Zufälliges Intervall für Klicks hinzugefügt.
    - Erkennung von Botschutz-Abfragen und automatische Pause.
    - Statusanzeige im Tab-Titel.
    - Anzeige der geschätzten Gesamtrestzeit zum Abarbeiten aller Farmen.`
    ];

    // --- Generiere das Changelog für den Alert (erste 2 Versionen) ---
    const SHORT_CHANGELOG = `--- Changelog TW Auto-Action ---\n\n` +
                            ALL_CHANGELOG_ENTRIES.slice(0, 2).join('\n\n');

    // --- Generiere das vollständige Changelog (erste 5 Versionen) ---
    const FULL_CHANGELOG = `--- Changelog TW Auto-Action ---\n\n` +
                           ALL_CHANGELOG_ENTRIES.slice(0, 5).join('\n\n');


    // --- Sound-Profile Definitionen ---
    const soundProfiles = {
        'default': { name: 'Standard (Hell)', frequency: 660, type: 'sine', duration: 0.8, volume: 0.5 },
        'alarm': { name: 'Alarm (Kurz & Hoch)', frequency: 880, type: 'triangle', duration: 0.4, volume: 0.6 },
        'chime': { name: 'Glocke (Tief & Langsam)', frequency: 440, type: 'sine', duration: 1.2, volume: 0.4 },
        'beep': { name: 'Beep (Standard-Signal)', frequency: 750, type: 'square', duration: 0.2, volume: 0.7 },
        'high_alert': { name: 'Hoher Alarm', frequency: 1000, type: 'sawtooth', duration: 0.3, volume: 0.7 },
        'soft_chime': { name: 'Sanfte Glocke', frequency: 523.25, type: 'sine', duration: 0.6, volume: 0.4 }, // C5
        'deep_thump': { name: 'Tiefer Puls', frequency: 120, type: 'square', duration: 0.5, volume: 0.8 },
        'quick_blip': { name: 'Kurzer Blip', frequency: 1500, type: 'sine', duration: 0.1, volume: 0.6 }
    };

    // --- Standardeinstellungen ---
    const defaultSettings = {
        minInterval: 200,
        maxInterval: 500,
        toggleKeyCode: 'KeyE', // Standard: 'E'
        toggleKeyChar: 'E', // Zeichen für die Anzeige im UI
        requiredCtrl: true,
        requiredAlt: false,
        requiredShift: true,
        pauseOnBotProtection: true, // Einstellung: Bei Botschutz pausieren
        soundEnabled: true, // Botschutz-Ton aktiviert
        selectedSound: 'default' // Standard: 'default' Sound
    };
    let currentSettings = {}; // Wird aus localStorage geladen

    // --- Funktionen zum Laden und Speichern der Einstellungen ---
    function loadSettings() {
        const savedSettings = localStorage.getItem('tw_auto_action_settings');
        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings);
                currentSettings = { ...defaultSettings, ...parsed };
                if (!currentSettings.toggleKeyChar && currentSettings.toggleKeyCode) {
                    currentSettings.toggleKeyChar = currentSettings.toggleKeyCode.replace('Key', '').replace('Digit', '');
                    if (currentSettings.toggleKeyCode === 'Space') currentSettings.toggleKeyChar = ' ';
                } else if (currentSettings.toggleKeyChar && !currentSettings.toggleKeyCode) {
                    currentSettings.toggleKeyCode = getKeyCodeFromChar(currentSettings.toggleKeyChar);
                }
                if (!soundProfiles[currentSettings.selectedSound]) {
                    currentSettings.selectedSound = 'default';
                }
            } catch (e) {
                console.error("Auto-Action: Fehler beim Laden der Einstellungen, verwende Standardeinstellungen:", e);
                currentSettings = { ...defaultSettings };
            }
        } else {
            currentSettings = { ...defaultSettings };
        }
    }

    function saveSettings() {
        localStorage.setItem('tw_auto_action_settings', JSON.stringify(currentSettings));
    }

    // --- Hilfsfunktion zum Umwandeln von Zeichen in event.code ---
    function getKeyCodeFromChar(char) {
        if (!char) return null;
        char = char.toUpperCase();
        if (char.length === 1 && char.match(/[A-Z]/)) {
            return 'Key' + char;
        }
        if (char === ' ') return 'Space';
        if (char.length === 1 && char.match(/[0-9]/)) {
            return 'Digit' + char;
        }
        return null;
    }

    // --- Skript-Variablen ---
    let autoActionActive = false;
    let autoActionIntervalId = null;
    let botProtectionDetected = false;
    let noFarmButtonsDetected = false;
    let initialReadyMessageShown = false; // Flag für die initiale Nachricht
    let nextClickTime = 0;

    // --- Variablen für Farms/Minute (Schätzung des Skripts) ---
    const clickTimestamps = []; // Speichert Zeitstempel der letzten Klicks
    const MAX_TIMESTAMPS = 60; // Anzahl der Zeitstempel, die wir speichern, um die Rate zu berechnen (letzte Minute)
    let calculatedFarmsPerMinute = 0; // Speichert den zuletzt berechneten FpM-Wert (basierend auf Klicks)
    let lastFpMCalculationTime = 0; // Zeitstempel der letzten FpM-Berechnung

    // --- Variablen für verifizierte FpM & Laufzeit ---
    let farmGodInitialCounter = 0; // Startwert der aktuell gesendeten Farmen (von FarmGodProgessbar.data('current'))
    let autoActionStartTime = 0;   // Startzeitpunkt der Auto-Action
    let verifiedFarmsPerMinute = 0; // Berechnete FpM aus dem data('current') Wert (vom Spiel gemeldet)

    // --- Durchschnittliche FpM für Anzeige und Berechnung ---
    let averageFarmsPerMinute = 0;

    const FPM_UPDATE_INTERVAL_MS = 5000; // FpM alle 5 Sekunden aktualisieren
    const VERIFIED_FPM_UPDATE_INTERVAL_MS = 10000; // Verifizierte FpM alle 10 Sekunden aktualisieren

    // --- Hilfsfunktion zum Generieren eines zufälligen Intervalls ---
    function getRandomInterval(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // --- AudioContext und Sound-Funktionen ---
    let audioCtx = null; // Globale Referenz für AudioContext

    // Funktion zum Initialisieren des AudioContext (lazy loading)
    function getAudioContext() {
        if (!audioCtx || audioCtx.state === 'closed') {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                console.log('TW Auto-Action: AudioContext initialisiert. Zustand:', audioCtx.state);
            } catch (e) {
                console.error("TW Auto-Action: FEHLER beim Initialisieren des AudioContext:", e);
                return null;
            }
        }
        return audioCtx;
    }

    // Funktion zum Wiederaufnehmen des AudioContext, falls suspended
    function resumeAudioContext(context) {
        if (context && context.state === 'suspended') {
            console.log('TW Auto-Action: AudioContext ist ausgesetzt, versuche Fortsetzung...');
            return context.resume().then(() => {
                console.log('TW Auto-Action: AudioContext erfolgreich fortgesetzt. Zustand:', context.state);
            }).catch(e => {
                console.error("TW Auto-Action: FEHLER beim Fortsetzen des AudioContext.", e);
            });
        }
        return Promise.resolve(); // Kontext ist bereits running oder kein Kontext
    }

    // Funktion zum Erzeugen und Abspielen eines Oszillators mit Profil-Parametern
    function createAndPlayOscillator(profile) {
        const context = getAudioContext();
        if (!context) return;

        resumeAudioContext(context).then(() => {
            try {
                const oscillator = context.createOscillator();
                const gainNode = context.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(context.destination);

                oscillator.type = profile.type;
                oscillator.frequency.setValueAtTime(profile.frequency, context.currentTime);
                gainNode.gain.setValueAtTime(profile.volume, context.currentTime);

                oscillator.start();
                gainNode.gain.exponentialRampToValueAtTime(0.001, context.currentTime + profile.duration);
                oscillator.stop(context.currentTime + profile.duration);
                // console.log(`TW Auto-Action: Oszillator-Ton '${profile.name}' abgespielt.`); // Weniger Log-Spam
            } catch (e) {
                console.error("TW Auto-Action: FEHLER beim Erzeugen oder Starten des Oszillators.", e);
            }
        }).catch(e => {
            console.error("TW Auto-Action: Konnte Ton nicht abspielen, AudioContext Resume fehlgeschlagen.", e);
        });
    }

    // Funktion zum Triggern des Botschutz-Tons (respektiert Einstellung)
    function triggerAntiBotSound() {
        console.log('TW Auto-Action: Trigger Botschutz-Ton (geprüft nach Einstellung)...');
        if (!currentSettings.soundEnabled) {
            console.log('TW Auto-Action: Botschutz-Ton ist in den Einstellungen deaktiviert. Überspringe Wiedergabe.');
            return;
        }
        const profile = soundProfiles[currentSettings.selectedSound] || soundProfiles['default'];
        createAndPlayOscillator(profile);
    }

    // Funktion für den Aktivierungs-Test-Ton (spielt den aktuell ausgewählten Ton, entsperrt Context)
    function playActivationTestTone() {
        if (!currentSettings.soundEnabled) {
            console.log('TW Auto-Action: Sound ist in den Einstellungen deaktiviert. Überspringe Test-Ton.');
            return;
        }
        const profileToPlay = soundProfiles[currentSettings.selectedSound] || soundProfiles['default'];
        createAndPlayOscillator(profileToPlay);
    }

    // --- Botschutz-Erkennung ---
    function checkAntiBotProtection() {
        const botProtectionSelectors = [
            'div#botprotection_quest',
            'div[data-id="bot_protection"]',
            '#popup_box_bot_protection',
            'div#tooltip:contains("Bot-Schutz")',
            '#bot_protect_dialog',
            '.popup_box_container:contains("Sicherheitsabfrage")',
            '#content_value:contains("Sicherheitsabfrage")',
            '.popup_box_container:contains("Bot-Schutz")',
            'div[data-bot-check="true"]',
            'img[src*="captcha"]',
            'input[name="captcha_code"]',
            '.modem-window:contains("Sicherheitsprüfung")',
            '#recaptcha-challenge',
            '#bot_captcha_div',
            'div.error:contains("Bitte bestätigen Sie, dass Sie kein Bot sind.")',
        ];

        let isBotProtectionVisible = false;
        for (const selector of botProtectionSelectors) {
            const element = $(selector);
            if (element.length > 0 && element.is(':visible') && element.css('display') !== 'none' && element.css('visibility') !== 'hidden' && element.attr('disabled') !== 'disabled' && element.outerWidth() > 0 && element.outerHeight() > 0) {
                isBotProtectionVisible = true;
                break;
            }
        }

        if (isBotProtectionVisible) {
            if (!botProtectionDetected) {
                botProtectionDetected = true;
                triggerAntiBotSound();
                if (autoActionActive && currentSettings.pauseOnBotProtection) {
                    clearInterval(autoActionIntervalId);
                    autoActionIntervalId = null;
                    autoActionActive = false;
                    // Beim Stoppen durch Botschutz auch Zähler zurücksetzen
                    farmGodInitialCounter = 0;
                    autoActionStartTime = 0;
                    verifiedFarmsPerMinute = 0;
                    averageFarmsPerMinute = 0;
                    if (typeof UI !== 'undefined' && typeof UI.ErrorMessage === 'function') {
                        UI.ErrorMessage('Botschutz-Abfrage erkannt! Auto-Action wurde gestoppt!', 5000);
                    }
                    console.warn('TW Auto-Action: Botschutz-Abfrage erkannt. Skript gestoppt.');
                } else if (typeof UI !== 'undefined' && typeof UI.ErrorMessage === 'function') {
                    UI.ErrorMessage('Botschutz-Abfrage erkannt! Auto-Action ist nicht aktiv oder pausiert nicht automatisch.', 5000);
                }
                updateUIStatus();
            }
            return true;
        } else {
            if (botProtectionDetected) {
                botProtectionDetected = false;
                if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                    UI.InfoMessage('Botschutz-Abfrage nicht mehr sichtbar. Auto-Action kann bei Bedarf wieder gestartet werden.', 3000);
                }
                updateUIStatus();
            }
            return false;
        }
    }

    // --- Funktion zum Simulieren des Button-Klicks ---
    function simulateButtonClick() {
        if (!autoActionActive) {
            return; // Beende, wenn Skript nicht aktiv ist (Sicherheitscheck)
        }

        if (typeof game_data !== 'undefined' && game_data.screen === 'am_farm') {
            if (checkAntiBotProtection()) {
                return;
            }

            const farmButton = $(FARM_BUTTON_SELECTOR).first();

            if (farmButton.length > 0 && farmButton.is(':visible') && !farmButton.is(':disabled')) {
                // Klick erfolgreich, Zeitstempel hinzufügen
                clickTimestamps.push(Date.now());
                // Nur die letzten X Zeitstempel behalten
                while (clickTimestamps.length > MAX_TIMESTAMPS) {
                    clickTimestamps.shift();
                }

                if (noFarmButtonsDetected) {
                    noFarmButtonsDetected = false;
                }
                farmButton.trigger('click');
                // UI wird durch das setInterval(updateUIStatus, 500) aktualisiert
            } else {
                if (!noFarmButtonsDetected) {
                    noFarmButtonsDetected = true;
                    if (autoActionActive) { // Stoppe nur, wenn es wirklich aktiv war
                        clearInterval(autoActionIntervalId);
                        autoActionIntervalId = null;
                        autoActionActive = false;
                        // Beim Stoppen durch fehlende Buttons auch Zähler zurücksetzen
                        farmGodInitialCounter = 0;
                        autoActionStartTime = 0;
                        verifiedFarmsPerMinute = 0;
                        averageFarmsPerMinute = 0;
                        if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                            UI.InfoMessage('Keine Farm-Buttons gefunden oder sichtbar. Auto-Action gestoppt!', 3000);
                        }
                        console.log('TW Auto-Action: Keine Farm-Buttons gefunden oder sichtbar. Skript gestoppt.');
                    } else { // Wenn es inaktiv war, aber keine Buttons gefunden werden, nur Meldung
                        if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                            UI.InfoMessage('Keine Farm-Buttons gefunden oder sichtbar.', 3000);
                        }
                    }
                    updateUIStatus();
                }
                return; // Wichtig: Hier aufhören, da kein Klick erfolgte und das Intervall neu gesetzt werden muss
            }
        } else {
            if (autoActionActive) {
                clearInterval(autoActionIntervalId);
                autoActionIntervalId = null;
                autoActionActive = false;
                // Beim Stoppen durch Seitenwechsel auch Zähler zurücksetzen
                farmGodInitialCounter = 0;
                autoActionStartTime = 0;
                verifiedFarmsPerMinute = 0;
                averageFarmsPerMinute = 0;
                if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                    UI.InfoMessage('Auto-Action automatisch gestoppt (nicht auf Farm-Seite).', 3000);
                }
                noFarmButtonsDetected = false;
                botProtectionDetected = false;
                updateUIStatus();
            }
            return; // Wichtig: Hier aufhören, da kein Klick erfolgte und das Intervall neu gesetzt werden muss
        }

        // --- Nächsten Klick planen (nur wenn autoActionActive noch true ist) ---
        if (autoActionActive) {
            clearInterval(autoActionIntervalId); // Vorheriges Intervall löschen
            const newInterval = getRandomInterval(currentSettings.minInterval, currentSettings.maxInterval);
            nextClickTime = Date.now() + newInterval; // Nächste Klickzeit für Folgeintervall setzen (intern)
            autoActionIntervalId = setInterval(simulateButtonClick, newInterval);
        }
    }

    // --- Event Listener für Tastendrücke ---
    document.addEventListener('keydown', (event) => {
        const isHotkeyCombination =
            event.code === currentSettings.toggleKeyCode &&
            event.ctrlKey === currentSettings.requiredCtrl &&
            event.altKey === currentSettings.requiredAlt &&
            event.shiftKey === currentSettings.requiredShift;

        if (isHotkeyCombination) {
            event.preventDefault();
            window.toggleTribalAutoAction();
        }
    });

    // --- Funktion zum Abrufen des aktuellen FarmGod Zählers aus der FarmGodProgressBar ---
    function getFarmGodCurrentCountFromUI() {
        const progressBar = $('#FarmGodProgessbar');
        // Sicherstellen, dass die Progressbar existiert und der data('current') Wert gesetzt ist
        if (progressBar.length > 0 && progressBar.data('current') !== undefined) {
            return parseInt(progressBar.data('current'), 10);
        }
        return 0; // Rückgabe 0, wenn nicht gefunden oder Wert ungültig
    }

    // --- Globale Toggle Funktion für Auto-Action ---
    window.toggleTribalAutoAction = function() {
        if (autoActionActive) {
            clearInterval(autoActionIntervalId);
            autoActionIntervalId = null;
            autoActionActive = false;
            // Klick-Historie zurücksetzen, wenn gestoppt wird
            clickTimestamps.length = 0;
            nextClickTime = 0;
            calculatedFarmsPerMinute = 0;
            lastFpMCalculationTime = 0;

            // Für die Konsolenprüfung beim Stoppen
            const finalCounter = getFarmGodCurrentCountFromUI();
            const durationMs = Date.now() - autoActionStartTime;
            const farmsSentFinal = (finalCounter >= farmGodInitialCounter) ? (finalCounter - farmGodInitialCounter) : 0; // Sicherstellen, dass es nicht negativ ist
            const verifiedFpMOnStop = (farmsSentFinal > 0 && durationMs > 0) ? Math.round((farmsSentFinal / (durationMs / 1000)) * 60) : 0;

            console.groupCollapsed('TW Auto-Action Stopp-Details (v' + SCRIPT_VERSION + ')');
            console.log('--- Stopp ---');
            console.log('Initialer FarmGod Zähler (vom Start):', farmGodInitialCounter === 0 ? 'Nicht erfasst/0' : farmGodInitialCounter);
            console.log('Aktueller FarmGod Zähler (Ende):', finalCounter);
            console.log('Gesendete Farmen (Differenz während Laufzeit):', farmsSentFinal);
            console.log('Laufzeit:', formatDuration(durationMs));
            console.log('Verifizierte FpM beim Stopp:', verifiedFpMOnStop);
            console.groupEnd();


            // Zähler für verifizierte FpM zurücksetzen für den nächsten Start
            farmGodInitialCounter = 0;
            autoActionStartTime = 0;
            verifiedFarmsPerMinute = verifiedFpMOnStop; // Zeige den letzten Wert an, bis neuer Start
            averageFarmsPerMinute = verifiedFpMOnStop; // Letzten verifizierten Wert auch als Durchschnitt anzeigen

            if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                UI.InfoMessage('Auto-Action gestoppt.', 2000);
            }
            noFarmButtonsDetected = false;
            botProtectionDetected = false;
        } else {
            playActivationTestTone();

            if (checkAntiBotProtection()) {
                return;
            }

            const farmButtonCheck = $(FARM_BUTTON_SELECTOR).first();
            if (farmButtonCheck.length === 0 || !farmButtonCheck.is(':visible') || farmButtonCheck.is(':disabled')) {
                if (typeof UI !== 'undefined' && typeof UI.ErrorMessage === 'function') {
                    UI.ErrorMessage('Kann Auto-Action nicht starten: Keine Farm-Buttons gefunden oder sie sind nicht sichtbar/aktiv.', 4000);
                }
                noFarmButtonsDetected = true;
                updateUIStatus();
                return;
            }

            autoActionActive = true;
            if (autoActionIntervalId) clearInterval(autoActionIntervalId);

            // Initialisiere die Zähler für verifizierte FpM beim Start
            farmGodInitialCounter = getFarmGodCurrentCountFromUI();
            if (farmGodInitialCounter === 0) {
                console.warn("TW Auto-Action: Initialer FarmGod Zähler konnte nicht aus der Fortschrittsanzeige gelesen werden. Verifizierte FpM könnte ungenau sein.");
            } else {
                console.log('TW Auto-Action: Gestartet. Initialer FarmGod Zähler (von #FarmGodProgessbar.data("current")):', farmGodInitialCounter);
            }
            
            autoActionStartTime = Date.now();
            verifiedFarmsPerMinute = 0; // Setze initial auf 0 bis zur ersten Berechnung
            averageFarmsPerMinute = 0;

            // Initialen Klick auslösen und dann das Intervall für die folgenden Klicks starten
            const initialInterval = getRandomInterval(currentSettings.minInterval, currentSettings.maxInterval);
            nextClickTime = Date.now() + initialInterval;

            // Führe den ersten Klick nach dem initialen Intervall aus
            autoActionIntervalId = setInterval(simulateButtonClick, initialInterval);

            if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                let hotkeyDisplay = currentSettings.toggleKeyChar;
                if (currentSettings.requiredCtrl) hotkeyDisplay = 'Strg + ' + hotkeyDisplay;
                if (currentSettings.requiredAlt) hotkeyDisplay = 'Alt + ' + hotkeyDisplay;
                if (currentSettings.requiredShift) hotkeyDisplay = 'Shift + ' + hotkeyDisplay;
                hotkeyDisplay = hotkeyDisplay.replace(/\s\+\s$/, '');

                UI.InfoMessage('Auto-Action gestartet! (Hotkey: ' + hotkeyDisplay + ' zum Stoppen)', 3000);
            }
            noFarmButtonsDetected = false;
        }
        updateUIStatus(); // UI sofort aktualisieren nach Start/Stop
    };

    // --- PRÄZISER SELEKTOR FÜR BELIEBIGEN FARMGOD BUTTON ---
    const FARM_BUTTON_SELECTOR = 'a.farmGod_icon';

    let customDialogElement = null;

    // --- Einstellungsdialog ---
    function openSettingsDialog() {
        if (customDialogElement) {
            customDialogElement.remove();
            customDialogElement = null;
        }

        const dialogContentHtml = `
            <div id="tw_auto_action_settings_dialog_content" style="padding: 15px; background-color: #f7f3e6; border: 1px solid #804000; border-radius: 5px; box-shadow: 0 0 10px rgba(0,0,0,0.5); max-width: 400px; margin: 20px; position: relative;">
                <h3>Auto-Action Einstellungen (v${SCRIPT_VERSION})
                    <button id="tw_auto_action_show_changelog" class="btn" style="
                        margin-left: 10px;
                        padding: 3px 8px; /* Kleinerer Padding */
                        font-size: 10px; /* Kleinere Schriftgröße */
                        border: 1px solid #804000;
                        background-color: #d1b790;
                        color: #FFFFFF;
                        vertical-align: middle; /* Vertikale Ausrichtung */
                        display: inline-block; /* Inline-Block für die Positionierung neben Text */
                        margin-top: -2px; /* Leichte Anpassung nach oben, falls nötig */
                    ">Changelog</button>
                </h3>
                <style>
                    #tw_auto_action_settings_dialog_content table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    #tw_auto_action_settings_dialog_content th, #tw_auto_action_settings_dialog_content td { padding: 5px; border: 1px solid #ddd; text-align: left; }
                    #tw_auto_action_settings_dialog_content input[type="text"],
                    #tw_auto_action_settings_dialog_content input[type="number"] {
                        width: calc(100% - 12px);
                        padding: 5px;
                        box-sizing: border-box;
                        border: 1px solid #c2c2c2;
                        border-radius: 3px;
                    }
                    #tw_auto_action_settings_dialog_content input[type="checkbox"] { margin-right: 5px; }
                    #tw_auto_action_settings_dialog_content .btn {
                        margin-top: 15px;
                        margin-right: 10px;
                        padding: 8px 15px;
                        cursor: pointer;
                        font-weight: bold;
                        border: 1px solid #804000;
                        border-radius: 3px;
                        background-color: #f0e2b6;
                        color: #FFFFFF; /* Einstellungsdialog Button Textfarbe */
                    }
                    #tw_auto_action_settings_dialog_content .btn-red {
                        background-color: #d1b790;
                        border-color: #6d3300;
                        color: #FFFFFF; /* Einstellungsdialog Button Textfarbe */
                    }
                    #tw_auto_action_settings_dialog_content h3 {
                        color: #804000;
                        margin-top: 0;
                        border-bottom: 1px solid #804000;
                        padding-bottom: 5px;
                        display: flex; /* Flexbox für H3 Inhalt */
                        align-items: center; /* Vertikale Zentrierung */
                        justify-content: space-between; /* Abstand zwischen Text und Button */
                    }
                    #tw_auto_action_settings_dialog_content h3 span { /* Für den Textteil des H3 */
                        flex-grow: 1;
                    }
                    #tw_auto_action_settings_dialog_content label {
                        display: inline-flex;
                        align-items: center;
                        margin-bottom: 5px;
                    }
                    #tw_auto_action_settings_dialog_content select {
                        width: calc(100% - 80px);
                        padding: 5px;
                        box-sizing: border-box;
                        border: 1px solid #c2c2c2;
                        border-radius: 3px;
                        display: inline-block;
                        vertical-align: middle;
                    }
                    #tw_auto_action_settings_dialog_content #tw_auto_action_preview_sound {
                        width: auto;
                        padding: 5px 10px;
                        margin-left: 5px;
                        margin-top: 0;
                        display: inline-block;
                        vertical-align: middle;
                    }
                </style>
                <table class="vis">
                    <tr>
                        <th>Hotkey (Taste)</th>
                        <td><input type="text" id="setting_toggle_key_char" maxlength="1" value="${currentSettings.toggleKeyChar}" style="width: 30px; text-align: center;"></td>
                    </tr>
                    <tr>
                        <th>Benötigte Tasten</th>
                        <td>
                            <label><input type="checkbox" id="setting_required_ctrl" ${currentSettings.requiredCtrl ? 'checked' : ''}> Strg</label><br>
                            <label><input type="checkbox" id="setting_required_alt" ${currentSettings.requiredAlt ? 'checked' : ''}> Alt</label><br>
                            <label><input type="checkbox" id="setting_required_shift" ${currentSettings.requiredShift ? 'checked' : ''}> Shift</label>
                        </td>
                    </tr>
                    <tr>
                        <th>Min. Abstand (ms)</th>
                        <td><input type="number" id="setting_min_interval" min="50" max="10000" value="${currentSettings.minInterval}"></td>
                    </tr>
                    <tr>
                        <th>Max. Abstand (ms)</th>
                        <td><input type="number" id="setting_max_interval" min="50" max="10000" value="${currentSettings.maxInterval}"></td>
                    </tr>
                    <tr>
                        <th>Botschutz pausieren</th>
                        <td><input type="checkbox" id="setting_pause_on_bot_protection" ${currentSettings.pauseOnBotProtection ? 'checked' : ''}> Bei Botschutz-Abfrage pausieren</td>
                    </tr>
                    <tr>
                        <th>Botschutz-Ton</th>
                        <td>
                            <label><input type="checkbox" id="setting_sound_enabled" ${currentSettings.soundEnabled ? 'checked' : ''}> Ton abspielen</label><br>
                            <select id="setting_selected_sound">
                                ${Object.keys(soundProfiles).map(key => `
                                    <option value="${key}" ${currentSettings.selectedSound === key ? 'selected' : ''}>${soundProfiles[key].name}</option>
                                `).join('')}
                            </select>
                            <button id="tw_auto_action_preview_sound" class="btn">Hören</button>
                        </td>
                    </tr>
                </table>
                <button id="tw_auto_action_save_settings" class="btn">Speichern</button>
                <button id="tw_auto_action_close_settings" class="btn btn-red">Schließen</button>
            </div>
        `;

        customDialogElement = $(`
            <div id="tw_auto_action_custom_dialog_overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 100000; display: flex; justify-content: center; align-items: center; overflow-y: auto;">
                ${dialogContentHtml}
            </div>
        `);

        $('body').append(customDialogElement);

        // Anpassung des H3-Inhalts, um den Text und den Button korrekt zu trennen
        $('#tw_auto_action_settings_dialog_content h3').html(`
            <span>Auto-Action Einstellungen (v${SCRIPT_VERSION})</span>
            <button id="tw_auto_action_show_changelog" class="btn" style="
                margin-left: 10px;
                padding: 3px 8px; /* Kleinerer Padding */
                font-size: 10px; /* Kleinere Schriftgröße */
                border: 1px solid #804000;
                background-color: #d1b790;
                color: #FFFFFF;
                vertical-align: middle;
                display: inline-block;
                margin-top: -2px;
            ">Changelog</button>
        `);


        $('#tw_auto_action_save_settings').on('click', () => {
            const newToggleKeyChar = $('#setting_toggle_key_char').val().toUpperCase();
            const newToggleKeyCode = getKeyCodeFromChar(newToggleKeyChar);

            if (!newToggleKeyCode) {
                if (typeof UI !== 'undefined' && typeof UI.ErrorMessage === 'function') {
                    UI.ErrorMessage("Ungültige Hotkey-Taste. Verwende A-Z, 0-9 oder Leerzeichen.", 3000);
                }
                return;
            }

            let newMinInterval = parseInt($('#setting_min_interval').val(), 10);
            let newMaxInterval = parseInt($('#setting_max_interval', 10));

            if (isNaN(newMinInterval) || newMinInterval < 50) newMinInterval = 50;
            if (isNaN(newMaxInterval) || newMaxInterval < newMinInterval) newMaxInterval = newMinInterval + 100;

            currentSettings.toggleKeyChar = newToggleKeyChar;
            currentSettings.toggleKeyCode = newToggleKeyCode;
            currentSettings.requiredCtrl = $('#setting_required_ctrl').is(':checked');
            currentSettings.requiredAlt = $('#setting_required_alt').is(':checked');
            currentSettings.requiredShift = $('#setting_required_shift').is(':checked');
            currentSettings.minInterval = newMinInterval;
            currentSettings.maxInterval = newMaxInterval;
            currentSettings.pauseOnBotProtection = $('#setting_pause_on_bot_protection').is(':checked');
            currentSettings.soundEnabled = $('#setting_sound_enabled').is(':checked');
            currentSettings.selectedSound = $('#setting_selected_sound').val();

            saveSettings();
            customDialogElement.remove();
            customDialogElement = null;
            if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                UI.InfoMessage('Einstellungen gespeichert!', 2000);
            }
            if (autoActionActive) {
                clearInterval(autoActionIntervalId);
                autoActionIntervalId = null;
                autoActionActive = false;
                if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                    UI.InfoMessage('Skript pausiert. Starte per Hotkey oder extern zum Neustart mit neuen Einstellungen.', 3000);
                }
            }
            updateUIStatus();
        });

        $('#tw_auto_action_close_settings').on('click', () => {
            customDialogElement.remove();
            customDialogElement = null;
        });

        $('#tw_auto_action_preview_sound').on('click', (e) => {
            e.preventDefault();
            playActivationTestTone(); // Hier wird der Test-Ton gespielt
        });

        $('#tw_auto_action_show_changelog').on('click', (e) => {
            e.preventDefault();
            alert(FULL_CHANGELOG.trim());
        });
    }

    // --- Einstellungs-Button auf der Farm-Seite hinzufügen ---
    let settingsButtonRef = null;
    let toggleButtonRef = null;
    let statusBarRef = null;
    let mainContainerRef = null;

    function updateFarmsPerMinuteCalculation() {
        // Diese Funktion berechnet FpM und speichert sie in calculatedFarmsPerMinute
        // Diese Funktion wird alle 5s aufgerufen, wenn aktiv
        let farmsPerMinute = 0;
        if (clickTimestamps.length > 0) {
            const now = Date.now();
            const recentClicks = clickTimestamps.filter(ts => (now - ts) <= 60000);

            if (recentClicks.length > 1) {
                const oldestClickTime = recentClicks[0];
                const timeSpanSeconds = (now - oldestClickTime) / 1000;

                if (timeSpanSeconds >= 5) { // Mindestens 5 Sekunden Daten für genauere Rate
                    const clicksInTimeSpan = recentClicks.length;
                    farmsPerMinute = (clicksInTimeSpan / timeSpanSeconds) * 60;
                } else if (recentClicks.length > 0) { // Wenn weniger als 5s Daten aber Klicks vorhanden
                    // Schätzung basierend auf dem Durchschnitt des Intervalls
                    const avgInterval = (currentSettings.minInterval + currentSettings.maxInterval) / 2;
                    if (avgInterval > 0) {
                        farmsPerMinute = (recentClicks.length / (avgInterval / 1000)) * 60;
                    }
                }
            } else if (recentClicks.length === 1 && autoActionActive) {
                // Wenn nur ein Klick und aktiv, grobe Schätzung basierend auf dem Durchschnittsintervall
                const avgInterval = (currentSettings.minInterval + currentSettings.maxInterval) / 2;
                if (avgInterval > 0) {
                    farmsPerMinute = (1 / (avgInterval / 1000)) * 60;
                }
            }
        }
        calculatedFarmsPerMinute = Math.round(farmsPerMinute);
        lastFpMCalculationTime = Date.now();
    }

    // --- Funktion zur Berechnung der verifizierten FpM ---
    function updateVerifiedFarmsPerMinute() {
        if (!autoActionActive || autoActionStartTime === 0) {
            verifiedFarmsPerMinute = 0; // Rücksetzen, wenn nicht aktiv
            return;
        }

        const currentCounter = getFarmGodCurrentCountFromUI();
        if (currentCounter === 0 && farmGodInitialCounter === 0) {
             verifiedFarmsPerMinute = 0; // Keine Daten vorhanden
             return;
        }

        const currentTime = Date.now();
        const elapsedTimeSeconds = (currentTime - autoActionStartTime) / 1000;

        if (elapsedTimeSeconds < 10) { // Warte mindestens 10 Sekunden für eine sinnvolle Berechnung
            verifiedFarmsPerMinute = 0; // Zeige nichts an, solange nicht genug Daten vorhanden
            return;
        }

        const farmsSent = (currentCounter >= farmGodInitialCounter) ? (currentCounter - farmGodInitialCounter) : 0; // Sicherstellen, dass es nicht negativ ist

        if (farmsSent <= 0) {
            verifiedFarmsPerMinute = 0;
        } else {
            verifiedFarmsPerMinute = Math.round((farmsSent / elapsedTimeSeconds) * 60);
        }
    }

    // --- Hilfsfunktion zur Formatierung der Dauer (HH:MM:SS) ---
    function formatDuration(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        const pad = (num) => num.toString().padStart(2, '0');

        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }


    function updateUIStatus() {
        let currentTabTitle = originalDocumentTitle;
        let statusText = 'TW Auto-Action ist bereit.';
        let statusBarBgColor = '#ffc107'; // Standard: Gelb

        // FpM Berechnung der skript-eigenen Zählung
        if (autoActionActive && (Date.now() - lastFpMCalculationTime >= FPM_UPDATE_INTERVAL_MS || lastFpMCalculationTime === 0)) {
            updateFarmsPerMinuteCalculation();
        } else if (!autoActionActive && calculatedFarmsPerMinute !== 0 && lastFpMCalculationTime !== 0) {
             calculatedFarmsPerMinute = 0;
             lastFpMCalculationTime = 0;
        }

        // Verifizierte FpM Berechnung (vom Spiel gemeldet)
        updateVerifiedFarmsPerMinute();

        // --- Berechnung des Mittelwerts der FpM ---
        if (autoActionActive) {
            const validFpMVals = [];
            if (calculatedFarmsPerMinute > 0) validFpMVals.push(calculatedFarmsPerMinute);
            if (verifiedFarmsPerMinute > 0) validFpMVals.push(verifiedFarmsPerMinute);

            if (validFpMVals.length > 0) {
                const sumFpM = validFpMVals.reduce((a, b) => a + b, 0);
                averageFarmsPerMinute = Math.round(sumFpM / validFpMVals.length);
            } else {
                averageFarmsPerMinute = 0;
            }
        } else {
            averageFarmsPerMinute = 0; // Setze auf 0, wenn Skript nicht aktiv ist
        }


        let farmsPerMinuteDisplay = (averageFarmsPerMinute > 0) ? `(${averageFarmsPerMinute} FpM)` : '';

        // Geschätzte Restlaufzeit zum Abarbeiten aller Farmen (basierend auf averageFarmsPerMinute)
        let totalFarmsRemainingTimeText = '';
        if (autoActionActive && averageFarmsPerMinute > 0 && typeof game_data !== 'undefined' && game_data.screen === 'am_farm') {
            const farmGodProgressbarMax = $('#FarmGodProgessbar').data('max');
            const farmGodProgressbarVal = $('#FarmGodProgessbar').data('current');

            if (farmGodProgressbarMax !== undefined && farmGodProgressbarVal !== undefined) {
                const remainingFarms = farmGodProgressbarMax - farmGodProgressbarVal;
                if (remainingFarms > 0) {
                    const estimatedMinutesFloat = remainingFarms / averageFarmsPerMinute;
                    const totalSecondsEstimate = Math.max(0, Math.round(estimatedMinutesFloat * 60));
                    const hours = Math.floor(totalSecondsEstimate / 3600);
                    const minutes = Math.floor((totalSecondsEstimate % 3600) / 60);
                    const seconds = totalSecondsEstimate % 60;

                    let formattedMinutes = minutes.toString().padStart(2, '0');
                    let formattedSeconds = seconds.toString().padStart(2, '0');

                    if (hours > 0) {
                        totalFarmsRemainingTimeText = ` | Rest: ${hours}h ${minutes}m:${formattedSeconds}s`;
                    } else {
                        totalFarmsRemainingTimeText = ` | Rest: ${minutes}m:${formattedSeconds}s`;
                    }
                }
            }
        }


        const defaultButtonBg = '#f0e2b6';
        const defaultButtonBorder = '#804000';

        if (settingsButtonRef) {
            settingsButtonRef.css({
                'background-color': defaultButtonBg,
                'border-color': defaultButtonBorder
            });
        }

        if (toggleButtonRef) {
            toggleButtonRef.text(autoActionActive ? 'Auto-Action Stopp' : 'Auto-Action Start');
            toggleButtonRef.css({
                'background-color': defaultButtonBg,
                'border-color': defaultButtonBorder
            });
        }

        if (botProtectionDetected) {
            statusBarBgColor = '#dc3545'; // Rot
            currentTabTitle = `[BOTSCHUTZ PAUSE] TW Auto-Action | ${originalDocumentTitle}`;
            statusText = `[BOTSCHUTZ] Auto-Action pausiert! ${farmsPerMinuteDisplay}`;
        } else if (autoActionActive) {
            statusBarBgColor = '#28a745'; // Grün
            currentTabTitle = `[AKTIV] TW Auto-Action ${farmsPerMinuteDisplay}${totalFarmsRemainingTimeText} | ${originalDocumentTitle}`;
            // Statusleiste enthält jetzt nur FpM und Restzeit
            statusText = `[AKTIV] Auto-Action läuft... ${farmsPerMinuteDisplay}${totalFarmsRemainingTimeText}`;
        } else if (noFarmButtonsDetected) {
            statusBarBgColor = '#ffc107'; // Gelb
            currentTabTitle = `[KEINE BUTTONS] TW Auto-Action | ${originalDocumentTitle}`;
            statusText = `[KEINE BUTTONS] Auto-Action gestoppt. ${farmsPerMinuteDisplay}`;
        } else {
            statusBarBgColor = '#ffc107'; // Gelb
            statusText = `Auto-Action ist inaktiv. ${farmsPerMinuteDisplay}`;
        }

        document.title = currentTabTitle;

        if (statusBarRef) {
            statusBarRef.text(statusText);
            statusBarRef.css({
                'background-color': statusBarBgColor,
                'color': '#ffffff'
            });
        }
    }

    function addAmFarmSettingsButton() {
        if (typeof game_data === 'undefined' || game_data.screen !== 'am_farm' || typeof $ === 'undefined') {
            console.log("TW Auto-Action: Nicht auf Farm-Seite oder jQuery nicht geladen.");
            return;
        }

        const contentValue = $('#content_value');
        if (contentValue.length === 0) {
            console.warn("TW Auto-Action: Konnte das '#content_value' Element nicht finden. Buttons werden nicht angezeigt.");
            return;
        }

        let targetElement = contentValue.find('table.vis').first();

        if (targetElement.length === 0) {
            targetElement = contentValue.find('h3').first();
            if (targetElement.length === 0) {
                targetElement = contentValue;
            }
        }

        const buttonBaseStyle = `
            white-space: nowrap;
            display: inline-block;
            padding: 8px 15px;
            cursor: pointer;
            font-weight: bold;
            border-radius: 3px;
            color: #FFFFFF; /* Textfarbe ist weiß */
            background-color: #f0e2b6;
            border: 1px solid #804000;
        `;

        const toggleButtonHtml = `<a href="#" id="tw_auto_action_toggle_button" class="btn" style="${buttonBaseStyle}">Auto-Action Start/Stopp</a>`;
        const settingsButtonHtml = `<a href="#" id="tw_auto_action_settings_button" class="btn" style="${buttonBaseStyle}">Auto-Action Einstellungen</a>`;

        const statusBarHtml = `
            <div id="tw_auto_action_status_bar" style="
                background-color: rgba(0,0,0,0.7);
                color: white;
                padding: 5px 10px;
                border-radius: 3px;
                font-size: 12px;
                text-align: left;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                box-sizing: border-box;
                flex-grow: 1;
                min-width: 50px;
            ">
                TW Auto-Action ist bereit.
            </div>
        `;

        const mainContainerHtml = `
            <div id="tw_auto_action_main_container" style="
                display: flex;
                justify-content: flex-start;
                align-items: center;
                gap: 10px;
                margin-top: 15px;
                margin-bottom: 15px;
                width: 100%;
                box-sizing: border-box;
            ">
                ${toggleButtonHtml}
                ${settingsButtonHtml}
                ${statusBarHtml}
            </div>
        `;

        targetElement.before(mainContainerHtml);

        mainContainerRef = $('#tw_auto_action_main_container');
        toggleButtonRef = mainContainerRef.find('#tw_auto_action_toggle_button');
        settingsButtonRef = mainContainerRef.find('#tw_auto_action_settings_button');
        statusBarRef = mainContainerRef.find('#tw_auto_action_status_bar');


        if (settingsButtonRef.length > 0) {
            settingsButtonRef.on('click', (e) => {
                e.preventDefault();
                openSettingsDialog();
            });
        }

        if (toggleButtonRef.length > 0) {
            toggleButtonRef.on('click', (e) => {
                e.preventDefault();
                window.toggleTribalAutoAction();
            });
        }

        updateUIStatus();
    }

    // --- Changelog-Anzeige beim ersten Laden einer neuen Version ---
    function showChangelogIfNewVersion() {
        const lastSeenVersion = localStorage.getItem('tw_auto_action_last_seen_version');

        if (lastSeenVersion !== SCRIPT_VERSION) {
            // Version ist neu oder wurde noch nie gesehen
            alert(SHORT_CHANGELOG.trim()); // Hier das kurze Changelog anzeigen
            localStorage.setItem('tw_auto_action_last_seen_version', SCRIPT_VERSION);
        }
    }

    // --- Skript-Initialisierung ---
    loadSettings();

    function initializeScript() {
        if (typeof $ === 'undefined') {
            console.log('TW Auto-Action: jQuery noch nicht geladen, warte 100ms...');
            setTimeout(initializeScript, 100);
            return;
        }

        $(document).ready(function() {
            addAmFarmSettingsButton();
            showChangelogIfNewVersion(); // Changelog beim Start prüfen und anzeigen

            if (!initialReadyMessageShown && typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                setTimeout(() => {
                    let hotkeyDisplay = currentSettings.toggleKeyChar;
                    if (currentSettings.requiredCtrl) hotkeyDisplay = 'Strg + ' + hotkeyDisplay;
                    if (currentSettings.requiredAlt) hotkeyDisplay = 'Alt + ' + hotkeyDisplay;
                    if (currentSettings.requiredShift) hotkeyDisplay = 'Shift + ' + hotkeyDisplay;
                    hotkeyDisplay = hotkeyDisplay.replace(/\s\+\s$/, '');

                    UI.InfoMessage('TW Auto-Action (v' + SCRIPT_VERSION + ') ist bereit. Starte per Hotkey: ' + hotkeyDisplay + ' oder über den "Start/Stopp"-Button.', 3000);
                    initialReadyMessageShown = true;
                }, 1000);
            }

            const observerConfig = { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'value', 'data-current', 'data-max'] };

            const observer = new MutationObserver((mutationsList, observer) => {
                const relevantChange = mutationsList.some(mutation =>
                    mutation.type === 'childList' ||
                    (mutation.type === 'attributes' && (mutation.attributeName === 'style' || mutation.attributeName === 'class'))
                );

                // Check FarmGod progressbar changes to update remaining time more actively
                const farmGodProgressbarChanged = mutationsList.some(mutation =>
                    $(mutation.target).is('#FarmGodProgessbar') || $(mutation.target).find('#FarmGodProgessbar').length > 0 ||
                    (mutation.type === 'attributes' && mutation.target.id === 'FarmGodProgessbar' && (mutation.attributeName === 'value' || mutation.attributeName === 'data-max' || mutation.attributeName === 'data-current'))
                );

                // UI Status nur aktualisieren, wenn relevante Änderungen oder wenn das Skript aktiv ist
                if (autoActionActive || botProtectionDetected || noFarmButtonsDetected || relevantChange || farmGodProgressbarChanged) {
                    const botProtectionFound = checkAntiBotProtection();

                    if (!botProtectionFound && typeof game_data !== 'undefined' && game_data.screen === 'am_farm') {
                        const farmButton = $(FARM_BUTTON_SELECTOR).first();
                        if (farmButton.length === 0 || !farmButton.is(':visible') || farmButton.is(':disabled')) {
                            if (autoActionActive) {
                                clearInterval(autoActionIntervalId);
                                autoActionIntervalId = null;
                                autoActionActive = false;
                                if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                                    UI.InfoMessage('Keine Farm-Buttons mehr gefunden/sichtbar. Auto-Action gestoppt!', 3000);
                                }
                            }
                            if (!noFarmButtonsDetected) {
                                noFarmButtonsDetected = true;
                                updateUIStatus();
                            }
                        } else {
                            if (noFarmButtonsDetected) {
                                noFarmButtonsDetected = false;
                                updateUIStatus();
                            }
                        }
                    } else if (!botProtectionFound) {
                        if (noFarmButtonsDetected || botProtectionDetected) {
                            noFarmButtonsDetected = false;
                            botProtectionDetected = false;
                            updateUIStatus();
                        }
                    }
                }
            });

            observer.observe(document.body, observerConfig);

            // Interval für regelmäßige UI-Updates
            setInterval(updateUIStatus, 500); // UI alle 500ms aktualisieren

            // Initialen Status setzen
            checkAntiBotProtection();
            if (typeof game_data !== 'undefined' && game_data.screen === 'am_farm') {
                const farmButton = $(FARM_BUTTON_SELECTOR).first();
                if (farmButton.length === 0 || !farmButton.is(':visible') || farmButton.is(':disabled')) {
                    noFarmButtonsDetected = true;
                }
            }
            // FpM initial berechnen, wenn das Skript startet und Farmen verfügbar sind
            if (autoActionActive) {
                updateFarmsPerMinuteCalculation(); // Beim Start initial einmal berechnen (skript-intern)
                updateVerifiedFarmsPerMinute(); // Und die verifizierte FpM (vom Spiel)
            }
            updateUIStatus(); // Initialen Status setzen, bevor Intervalle laufen
        });
    }

    // Starte die Initialisierung
    initializeScript();

})();
