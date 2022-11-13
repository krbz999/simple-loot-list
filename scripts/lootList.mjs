import { MODULE, ITEMS, CURRENCIES } from "./constants.mjs";
import { SLL_HELPERS } from "./helpers.mjs";

export class LootList extends FormApplication {

  constructor(actor) {
    super(actor);
    this.actor = actor;
  }

  get id() {
    return `${MODULE}-${this.actor.id}`;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sheet", MODULE],
      width: 550,
      template: "modules/simple-loot-list/templates/lootListTemplate.hbs",
      height: "auto",
      dragDrop: [{ dragSelector: null, dropSelector: ".item-list-add" }]
    });
  }

  get lootItems() {
    return this.actor.getFlag(MODULE, ITEMS) ?? [];
  }

  get currencies() {
    const flag = this.actor.getFlag(MODULE, CURRENCIES);
    if (flag) {
      return Object.entries(flag).map(([key, value]) => {
        return { key, value, label: CONFIG.DND5E.currencies[key].label };
      });
    } else return Object.entries(CONFIG.DND5E.currencies).map(([key, { label }]) => {
      return { key, label, value: 0 };
    });
  }

  async getData(options) {
    const data = await super.getData(options);
    data.lootItems = this.lootItems;
    data.currencies = this.currencies;
    return data;
  }

  async _onDrop(event) {
    event.stopPropagation();
    event.target.closest(".ondrop-box").classList.remove("drag-over");

    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    }
    catch (err) {
      return false;
    }
    const items = await SLL_HELPERS.validDrops(data);
    if (!items) return;

    // append:
    const list = this.element[0].querySelector(".item-list");
    for (const { uuid, name } of items) {
      // find any current row with the same item.
      const valueNode = SLL_HELPERS.findDuplicates(this.element, uuid);

      // if no node, create new row.
      if (!valueNode) {
        const div = document.createElement("DIV");
        div.innerHTML = await SLL_HELPERS.createNewRow(uuid, name);
        list.appendChild(div.firstChild);
      }
      // increase the value of the existing row.
      else {
        valueNode.value = SLL_HELPERS.appendQuantity(valueNode);
      }

    }
    if (items.length > 1) {
      SLL_HELPERS.warning("SIMPLE_LOOT_LIST.WARNING.ADDED_ITEMS_TO_LIST", {
        amount: items.length,
        name: this.actor.name
      }, "info");
    }
    this.setPosition();
  }

  async _onDragOver(event) {
    const dropPoint = event.target.closest(".ondrop-box");
    if (!dropPoint) return;
    dropPoint.classList.add("drag-over");
  }

  async _updateObject(event, formData) {
    formData[`flags.${MODULE}.${ITEMS}`] = SLL_HELPERS.getItemsFromHTML(this.element[0]);
    return this.actor.update(formData);
  }

  activateListeners(html) {
    super.activateListeners(html);

    html[0].addEventListener("click", async (event) => {
      const deleteButton = event.target.closest(".item-delete");
      const itemName = event.target.closest(".item-name");
      if (deleteButton) {
        const row = deleteButton.closest(".item");
        if (row) {
          row.remove();
          this.setPosition();
        }
      } else if (itemName) {
        const { uuid } = itemName.dataset;
        const item = await fromUuid(uuid);
        if (!item) {
          SLL_HELPERS.warning("SIMPLE_LOOT_LIST.WARNING.NO_SUCH_ITEM", {
            name: itemName.innerText
          });
          return;
        }
        return item.sheet.render(true);
      }
    });

    html[0].addEventListener("dragleave", (event) => {
      const dropPoint = event.target.closest(".ondrop-box");
      if (dropPoint) {
        dropPoint.classList.remove("drag-over");
      }
    });

    html[0].addEventListener("click", (event) => {
      const button = event.target.closest("button[type='button']");
      if (!button) return;
      // delete the list.
      if (button.name === "clear") {
        this.element[0].querySelectorAll(".item").forEach(li => li.remove());
        this.setPosition();
        return;
      }
      // just close, don't save.
      if (button.name === "cancel") return this.close();
      // if grant, must have target.
      if (button.name === "grant") {
        const target = game.user.targets.first().document.uuid;
        const lootArray = SLL_HELPERS.getItemsFromHTML(this.element[0]);
        const currencies = SLL_HELPERS.getCurrenciesFromHTML(this.element[0]);
        return SLL_HELPERS.grantLootToTarget(lootArray, currencies, target);
      }
    })
  }
}
