import { MODULE } from "./scripts/constants.mjs";
import { LootList } from "./scripts/lootList.mjs";

Hooks.once("init", () => {
  console.log("ZHELL | Initializing Simple Loot List");

  game.settings.register(MODULE, "headerLabel", {
    name: game.i18n.localize("SIMPLE_LOOT_LIST.SETTINGS.HEADER_LABEL.NAME"),
    hint: game.i18n.localize("SIMPLE_LOOT_LIST.SETTINGS.HEADER_LABEL.HINT"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  Hooks.on("getActorSheetHeaderButtons", (app, array) => {
    if (!game.user.isGM) return;
    const label = game.settings.get(MODULE, "headerLabel");
    const listButton = {
      class: MODULE,
      icon: "fa-solid fa-coins",
      onclick: async () => {
        new LootList(app.object).render(true, {
          title: game.i18n.format("SIMPLE_LOOT_LIST.TITLE", {
            name: app.object.name
          })
        });
      }
    }
    if (label) {
      listButton.label = game.i18n.localize("SIMPLE_LOOT_LIST.HEADER");
    }
    array.unshift(listButton);
  });
});
