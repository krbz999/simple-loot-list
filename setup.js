import { MODULE_TITLE, MODULE_TITLE_SHORT, HEADER_BUTTON, MODULE_NAME } from "./scripts/const.mjs";
import { LootList } from "./scripts/lootList.mjs";
//import { api } from "./scripts/api.mjs";

Hooks.once("init", () => {
    console.log(`${MODULE_TITLE_SHORT} | Initializing ${MODULE_TITLE}`);
    //api.register();
});

Hooks.on("getActorSheetHeaderButtons", (app, array) => {
    if(!game.user.isGM) return;
    const listButton = {
        class: MODULE_NAME,
        icon: "fas fa-coins",
        label: HEADER_BUTTON,
        onclick: async () => {
            new LootList(app.object).render(true);
        }
    }
    array.unshift(listButton);
});
