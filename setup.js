import { HEADER_BUTTON, MODULE_NAME } from "./scripts/const.mjs";
import { LootList } from "./scripts/lootList.mjs";

Hooks.once("init", () => {
    console.log("ZHELL | Initializing Simple Loot List");
    
    game.settings.register(MODULE_NAME, "headerLabel", {
        name: game.i18n.localize("SIMPLE_LOOT_LIST.SETTINGS.HEADER_LABEL.NAME"),
        hint: game.i18n.localize("SIMPLE_LOOT_LIST.SETTINGS.HEADER_LABEL.HINT"),
        scope: "world",
        config: true,
        type: Boolean,
        default: false
    });
    
    Hooks.on("getActorSheetHeaderButtons", (app, array) => {
        if(!game.user.isGM) return;

        const label = game.settings.get(MODULE_NAME, "headerLabel");

        const listButton = {
            class: MODULE_NAME,
            icon: "fas fa-coins",
            onclick: async () => {
                new LootList(app.object).render(true);
            }
        }
        if(label) listButton.label = HEADER_BUTTON;
        array.unshift(listButton);
    });
});
