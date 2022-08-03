import { CONSTS } from "./scripts/const.mjs";
import { LootList } from "./scripts/lootList.mjs";
import { api } from "./scripts/api.mjs";

Hooks.once("init", () => {
    console.log(`${CONSTS.MODULE_TITLE_SHORT} | Initializing ${CONSTS.MODULE_TITLE}`);
    //api.register();
});

Hooks.on("getActorSheetHeaderButtons", (app, array) => {
    if(!game.user.isGM) return;
    const listButton = {
        class: "simple-loot-list",
        icon: "fas fa-coins",
        label: "Loot List",
        onclick: async () => {
            new LootList(app.object).render(true);
        }
    }
    array.unshift(listButton);
});
