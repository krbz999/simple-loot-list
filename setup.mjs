import { MODULE } from "./scripts/constants.mjs";
import { LootList } from "./scripts/lootList.mjs";

Hooks.once("init", () => {
  console.log("ZHELL | Initializing Simple Loot List");

  game.settings.register(MODULE, "headerLabel", {
    name: "SimpleLootList.SettingHeaderLabelName",
    hint: "SimpleLootList.SettingHeaderLabelHint",
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
          title: game.i18n.format("SimpleLootList.Title", {
            name: app.object.name
          })
        });
      }
    }
    if (label) {
      listButton.label = game.i18n.localize("SimpleLootList.Header");
    }
    array.unshift(listButton);
  });
});
