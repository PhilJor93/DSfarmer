// Die Stämme - Reports Script
// Version: 2.1
// Autor: xdam98
// Dieses Script wird über die Schnellleiste ausgeführt und erstellt automatisch Notizen aus Berichten.

(function() {
    'use strict';
    
    // Script configuration
    const ScriptData = {
        name: "Auto notes from report",
        version: "v2.1",
        lastUpdate: "2021-03-07", 
        author: "xdam98",
        authorContact: "Xico#7941 (Discord)"
    };

    const LS_prefix = "xd";

    // Multi-language translations (German and English only)
    const translations = {
        de_DE: {
            unknown: "Unbekannt",
            verifyReportPage: "Dieses Script kann nur auf einer Berichtsseite ausgeführt werden.",
            offensive: "Offensiv",
            defensive: "Defensiv",
            probOffensive: "Wahrscheinlich Offensiv",
            probDefensive: "Wahrscheinlich Defensiv",
            noSurvivors: "Keine Truppen überlebt",
            watchtower: "Wachturm",
            wall: "Wall",
            firstChurch: "Erste Kirche",
            church: "Kirche",
            defensiveNukes: "Defensive Vollausbauten",
            noteCreated: "Notiz erstellt",
            addReportTo: "Bericht zu welchem Dorf hinzufügen:"
        },
        en_DK: {
            unknown: "Unknown",
            verifyReportPage: "This script can only be run on a report screen.",
            offensive: "Offensive",
            defensive: "Defensive",
            probOffensive: "Probably Offensive",
            probDefensive: "Probably Defensive",
            noSurvivors: "No troops survived",
            watchtower: "Watchtower",
            wall: "Wall",
            firstChurch: "First church",
            church: "Church",
            defensiveNukes: "defensive nukes",
            noteCreated: "Note created",
            addReportTo: "Add report to which village:"
        },
        en_US: {
            unknown: "Unknown",
            verifyReportPage: "This script can only be run on a report screen.",
            offensive: "Offensive",
            defensive: "Defensive",
            probOffensive: "Probably Offensive",
            probDefensive: "Probably Defensive",
            noSurvivors: "No troops survived",
            watchtower: "Watchtower",
            wall: "Wall",
            firstChurch: "First church",
            church: "Church",
            defensiveNukes: "defensive nukes",
            noteCreated: "Note created",
            addReportTo: "Add report to which village:"
        }
    };

    // Translation helper function
    const _t = (key) => translations[game_data.locale]?.[key] || translations.de_DE[key];

    // Initialize translations
    const initTranslations = () => {
        if (localStorage.getItem(`${LS_prefix}_langWarning`)) return 1;
        if (!translations[game_data.locale]) {
            UI.ErrorMessage(`No translation found for <b>${game_data.locale}</b>.`, 3000);
        }
        localStorage.setItem(`${LS_prefix}_langWarning`, 1);
        return 0;
    };

/**
 * Main Report Notes Creator Object
 */
const ReportNoteGenerator = {
    /**
     * Data structure to store all report information
     */
    data: {
        player: {
            name: game_data.player.name,
            isAttacker: false,
            isDefender: false,
            wantsAttackerInfo: false,
            wantsDefenderInfo: false
        },
        village: {
            offense: {
                villageId: "-1",
                villageType: _t("unknown"),
                troops: {
                    total: [],
                    offensive: 0,
                    defensive: 0
                }
            },
            defense: {
                villageId: "-1",
                villageType: _t("unknown"),
                troops: {
                    visible: false,
                    total: [],
                    outside: {
                        visible: false,
                        offensive: 0,
                        defensive: 0,
                        total: []
                    },
                    inside: {
                        offensive: 0,
                        defensive: 0,
                        total: []
                    },
                    supports: 0
                },
                buildings: {
                    buildingsVisible: false,
                    watchtower: [false, 0],
                    firstChurch: [false, 0],
                    church: [false, 0],
                    wall: [false, 0]
                }
            }
        },
        world: {
            farmPerUnit: [],
            hasArchers: false
        }
    },

    /**
     * Script configurations
     */
    configs: {
        hideTroops: false
    },

    /**
     * Verify if we're on a report page
     * @returns {boolean} True if on report page
     */
    verifyPage: function() {
        const matches = window.location.href.match(/(screen\=report){1}|(view\=){1}\w+/g);
        
        if (!matches || matches.length !== 2) {
            UI.ErrorMessage(_t("verifyReportPage"), 5000);
            return false;
        }
        
        return true;
    },

    /**
     * Initialize script configurations
     */
    initConfigs: function() {
        this.configs.hideTroops = this.loadLSConfig("hideTroops", false);
    },

    /**
     * Initialize report data by parsing the current report screen
     */
    initReportData: function() {
        const self = this;
        // Detect archer worlds and initialize arrays and farm costs
        this.data.world.hasArchers = game_data.units.includes("archer");
        if (this.data.world.hasArchers) {
            this.data.village.offense.troops.total = new Array(10).fill(0);
            this.data.village.defense.troops.total = new Array(10).fill(0);
            this.data.village.defense.troops.outside.total = new Array(10).fill(0);
            this.data.village.defense.troops.inside.total = new Array(10).fill(0);
            // pop values per unit (with archers)
            this.data.world.farmPerUnit = [1, 1, 1, 1, 2, 4, 5, 6, 5, 8];
        } else {
            this.data.village.offense.troops.total = new Array(8).fill(0);
            this.data.village.defense.troops.total = new Array(8).fill(0);
            this.data.village.defense.troops.outside.total = new Array(8).fill(0);
            this.data.village.defense.troops.inside.total = new Array(8).fill(0);
            // pop values per unit (no archers)
            this.data.world.farmPerUnit = [1, 1, 1, 2, 4, 6, 5, 8];
        }

        // Extract attacker/defender names
        const attackerName = $("#attack_info_att > tbody > tr:nth-child(1) > th:nth-child(2) > a").text();
        const defenderName = $("#attack_info_def > tbody > tr:nth-child(1) > th:nth-child(2) > a").text();

        // Index for village id depending on sitter
        let idx = 3;
        if (game_data.player.sitter !== "0") idx = 4;

        // Extract attacker/defender village IDs
        this.data.village.offense.villageId = $("#attack_info_att > tbody > tr:nth-child(2) > td:nth-child(2) > span > a:nth-child(1)").url().split("=")[idx];
        this.data.village.defense.villageId = $("#attack_info_def > tbody > tr:nth-child(2) > td:nth-child(2) > span > a:nth-child(1)").url().split("=")[idx];

        // Determine if the current player is attacker or defender
        if (defenderName === this.data.player.name) this.data.player.isDefender = true;
        if (attackerName === this.data.player.name) this.data.player.isAttacker = true;

        // Troops away (outside)
        if ($("#attack_spy_away > tbody > tr:nth-child(1) > th").length) {
            this.data.village.defense.troops.outside.visible = true;
            const cells = $("#attack_spy_away > tbody > tr:nth-child(2) > td > table > tbody > tr:nth-child(2) > td");
            cells.each(function(i, el) {
                const val = parseInt(el.textContent);
                if (i < self.data.village.defense.troops.total.length) {
                    self.data.village.defense.troops.outside.total[i] = val;
                }
                if (self.data.world.hasArchers) {
                    // offensive indices (spear=0, sword=1, axe=2, archer=3, scout=4, light=5, marcher=6, heavy=7, ram=8, catapult=9)
                    if (i === 2 || i === 5 || i === 6 || i === 8) {
                        self.data.village.defense.troops.outside.offensive += val * self.data.world.farmPerUnit[i];
                    } else if (i === 0 || i === 1 || i === 3 || i === 7 || i === 9) {
                        self.data.village.defense.troops.outside.defensive += val * self.data.world.farmPerUnit[i];
                    }
                } else {
                    // no archers: spear=0, sword=1, axe=2, scout=3, light=4, heavy=5, ram=6, catapult=7
                    if (i === 2 || i === 4 || i === 6) {
                        self.data.village.defense.troops.outside.offensive += val * self.data.world.farmPerUnit[i];
                    } else if (i === 0 || i === 1 || i === 5 || i === 7) {
                        self.data.village.defense.troops.outside.defensive += val * self.data.world.farmPerUnit[i];
                    }
                }
            });
        }

        // Defender troops visible
        if ($("#attack_info_def_units > tbody > tr:nth-child(2) > td").length) {
            this.data.village.defense.troops.visible = true;
        }

        // Inside defense troops and attacking troops
        if (this.data.world.hasArchers) {
            if (this.data.village.defense.troops.visible) {
                $("#attack_info_def_units > tbody > tr:nth-child(2) > td.unit-item").each(function(i, el) {
                    const val = parseInt(el.textContent);
                    if (i < self.data.village.defense.troops.total.length) {
                        self.data.village.defense.troops.inside.total[i] = val;
                    }
                    if (i === 2 || i === 5 || i === 6 || i === 8) {
                        self.data.village.defense.troops.inside.offensive += val * self.data.world.farmPerUnit[i];
                    } else if (i === 0 || i === 1 || i === 3 || i === 7 || i === 9) {
                        self.data.village.defense.troops.inside.defensive += val * self.data.world.farmPerUnit[i];
                    }
                });
            }
            $("#attack_info_att_units > tbody > tr:nth-child(2) > td.unit-item").each(function(i, el) {
                const val = parseInt(el.textContent);
                if (i < self.data.village.offense.troops.total.length) {
                    self.data.village.offense.troops.total[i] = val;
                }
                if (i === 2 || i === 5 || i === 6) {
                    self.data.village.offense.troops.offensive += val * self.data.world.farmPerUnit[i];
                } else if (i === 0 || i === 1 || i === 3 || i === 7 || i === 9) {
                    self.data.village.offense.troops.defensive += val * self.data.world.farmPerUnit[i];
                }
            });
        } else {
            if (this.data.village.defense.troops.visible) {
                $("#attack_info_def_units > tbody > tr:nth-child(2) > td.unit-item").each(function(i, el) {
                    const val = parseInt(el.textContent);
                    if (i < self.data.village.defense.troops.total.length) {
                        self.data.village.defense.troops.inside.total[i] = val;
                    }
                    if (i === 2 || i === 4 || i === 6) {
                        self.data.village.defense.troops.inside.offensive += val * self.data.world.farmPerUnit[i];
                    } else if (i === 0 || i === 1 || i === 5 || i === 7) {
                        self.data.village.defense.troops.inside.defensive += val * self.data.world.farmPerUnit[i];
                    }
                });
            }
            $("#attack_info_att_units > tbody > tr:nth-child(2) > td.unit-item").each(function(i, el) {
                const val = parseInt(el.textContent);
                if (i < self.data.village.offense.troops.total.length) {
                    self.data.village.offense.troops.total[i] = val;
                }
                if (i === 2 || i === 4 || i === 6) {
                    self.data.village.offense.troops.offensive += val * self.data.world.farmPerUnit[i];
                } else if (i === 0 || i === 1 || i === 5 || i === 7) {
                    self.data.village.offense.troops.defensive += val * self.data.world.farmPerUnit[i];
                }
            });
        }

        // Buildings (watchtower, church, wall)
        if ($("#attack_spy_buildings_left > tbody > tr:nth-child(1) > th:nth-child(1)").length) {
            this.data.village.defense.buildings.buildingsVisible = true;
            $("table[id^='attack_spy_buildings_'] > tbody > tr:gt(0) > td > img").each(function(_i, img) {
                const key = img.src.split("/")[7].replace(".png", "");
                const level = parseInt(img.parentNode.parentNode.childNodes[3].textContent);
                if (key === "watchtower") self.data.village.defense.buildings.watchtower = [true, level];
                else if (key === "church_f") self.data.village.defense.buildings.firstChurch = [true, level];
                else if (key === "church") self.data.village.defense.buildings.church = [true, level];
                else if (key === "wall") self.data.village.defense.buildings.wall = [true, level];
            });
        }
    },

    /**
     * Determine village type based on troop population
     */
    getVillageType: function() {
        const d = this.data.village.defense.troops;
        // If defender troops visible, classify by inside troops
        if (d.visible) {
            if (d.inside.offensive > 3000) this.data.village.defense.villageType = _t("offensive");
            else if (d.inside.offensive > 500) this.data.village.defense.villageType = _t("probOffensive");
            else if (d.inside.defensive > 1000) this.data.village.defense.villageType = _t("defensive");
            else if (d.inside.defensive > 500) this.data.village.defense.villageType = _t("probDefensive");
            this.data.village.defense.troops.supports = Math.round((d.inside.defensive / 20000) * 10) / 10;
        } else {
            this.data.village.defense.villageType = _t("noSurvivors");
        }

        // Consider outside troops if visible
        if (d.outside.visible) {
            if (d.outside.offensive > 3000) this.data.village.defense.villageType = _t("offensive");
            else if (d.outside.offensive > 1000) this.data.village.defense.villageType = _t("probOffensive");
            else if (d.outside.defensive > 1000) this.data.village.defense.villageType = _t("defensive");
            else if (d.outside.defensive > 500) this.data.village.defense.villageType = _t("probDefensive");
            else if ((d.outside.defensive + d.outside.offensive) > 1000) {
                this.data.village.defense.villageType = d.outside.offensive > d.outside.defensive ? _t("probOffensive") : _t("probDefensive");
            }
            this.data.village.defense.troops.supports += Math.round((d.outside.defensive / 20000) * 10) / 10;
        }

        // Attack village type (based on attacking troops composition)
        const o = this.data.village.offense.troops;
        if (o.offensive > o.defensive) this.data.village.offense.villageType = _t("offensive");
        else if (o.offensive < o.defensive) this.data.village.offense.villageType = _t("defensive");

        // Debug: log classification inputs/outputs
        try {
            /* eslint-disable no-console */
            console.debug("[Reports] hasArchers=", this.data.world.hasArchers);
            console.debug("[Reports] DEF inside:", d.inside);
            console.debug("[Reports] DEF outside:", d.outside);
            console.debug("[Reports] DEF supports:", d.supports, "type=", this.data.village.defense.villageType);
            console.debug("[Reports] OFF totals:", o);
            console.debug("[Reports] OFF type=", this.data.village.offense.villageType);
            /* eslint-enable no-console */
        } catch (e) { /* noop */ }
    },

    /**
     * Generate formatted note text
     * @returns {string}
     */
    generateNoteText: function() {
        let vType;
        const reportCode = $("#report_export_code").text();
        const reportTime = $("#content_value > table > tbody > tr > td:nth-child(2) > table > tbody > tr > td > table:nth-child(2) > tbody > tr:nth-child(2)")
            .text().replace(/\s+/g, " ").replace(/.{5}$/, "");
        let note = "";

        // Always evaluate the opponent's side
        // If I am the attacker, show defender type; if I am the defender, show attacker type
        vType = this.data.player.isAttacker ? this.data.village.defense.villageType : this.data.village.offense.villageType;

        // Header with colored village type
        note += " | [color=#" + ((vType === _t("offensive") || vType === _t("probOffensive")) ? "ff0000" : "0eae0e") + "][b]" + vType + "[/b][/color] | ";
        // Debug: show quick toast with chosen vType
        try { UI.SuccessMessage("Type: " + vType, 1200); } catch (e) { /* noop */ }

        // Buildings and supports when viewing defender info
        if (this.data.player.isAttacker || this.data.player.wantsDefenderInfo) {
            const b = this.data.village.defense.buildings;
            if (b.watchtower[0]) note += "[building]watchtower[/building] " + _t("watchtower") + b.watchtower[1] + " | ";
            if (b.wall[0]) note += "[building]wall[/building][color=#5c3600][b] " + _t("wall") + b.wall[1] + "[/b][/color] | ";
            if (b.firstChurch[0]) note += "[building]church_f[/building] " + _t("firstChurch") + " | ";
            if (b.church[0]) note += "[building]church_f[/building] " + _t("church") + " " + b.church[1] + " | ";
            if (this.data.village.defense.troops.visible && vType !== _t("offensive") && vType !== _t("probOffensive")) {
                note += this.data.village.defense.troops.supports + _t("defensiveNukes") + " | ";
            }
        }

        note += "[b][size=6]Bericht[/size][/b]";
        note += "\n\n [b]" + reportTime + "[/b]";
        note += "" + reportCode;
        return note;
    },

    /**
     * Write note to the appropriate village
     */
    writeNote: function() {
        const self = this;
        let noteText;
        let targetVillageId = 0;
        // Choose village id based on context
        targetVillageId = (this.data.player.isAttacker || this.data.player.wantsDefenderInfo)
            ? parseInt(this.data.village.defense.villageId)
            : parseInt(this.data.village.offense.villageId);

        // Build API URL (sitter aware)
        const base = `https://${location.hostname}/game.php?village=${game_data.village.id}&screen=api&ajaxaction=village_note_edit`;
        const apiUrl = (game_data.player.sitter === "0")
            ? `${base}&h=${game_data.csrf}&client_time=${Math.round(Timing.getCurrentServerTime()/1000)}`
            : `${base}&t=${game_data.player.id}`;

        if (this.data.player.isAttacker || this.data.player.isDefender) {
            noteText = self.generateNoteText();
            $.post(apiUrl, { note: noteText, village_id: targetVillageId, h: game_data.csrf }, function() {
                UI.SuccessMessage(_t("noteCreated"), 2000);
            });
        } else {
            // Ask which village to add note to
            const $title = $('<div class="center"> ' + _t('addReportTo') + ' </div>');
            const $buttons = $('<div class="center"><button class="btn btn-confirm-yes atk">Attacker</button><button class="btn btn-confirm-yes def">Defender</button></div>');
            const $content = $title.add($buttons);
            Dialog.show('report_notes', $content);
            $buttons.find('button.atk').click(function() {
                self.data.player.wantsAttackerInfo = true;
                noteText = self.generateNoteText();
                $.post(apiUrl, { note: noteText, village_id: self.data.village.offense.villageId, h: game_data.csrf }, function() {
                    UI.SuccessMessage(_t("noteCreated"), 2000);
                });
                Dialog.close();
            });
            $buttons.find('button.def').click(function() {
                self.data.player.wantsDefenderInfo = true;
                noteText = self.generateNoteText();
                $.post(apiUrl, { note: noteText, village_id: self.data.village.defense.villageId, h: game_data.csrf }, function() {
                    UI.SuccessMessage(_t("noteCreated"), 2000);
                });
                Dialog.close();
            });
        }
    },

    /**
     * Load configuration from localStorage
     * @param {string} key - Configuration key
     * @param {*} defaultValue - Default value if not found
     * @returns {*} Configuration value
     */
    loadLSConfig: (key, defaultValue) => {
        return localStorage.getItem(`${LS_prefix}_${key}`) ?? defaultValue;
    },
    // Main script methods
    start: function() {
        if (this.verifyPage()) {
            this.initConfigs();
            this.initReportData();
            this.getVillageType();
            this.writeNote();
        }
    }
};

// Initialize and start the script
if (initTranslations()) {
    ReportNoteGenerator.start();
} else {
    setTimeout(() => {
        ReportNoteGenerator.start();
    }, 3000);
}


})();



