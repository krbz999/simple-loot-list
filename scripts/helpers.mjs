import { ITEMS, MODULE } from "./constants.mjs";

export class SLL_HELPERS {

  /**
   * Returns an array of valid items from a dropped document.
   * If single document, and it is valid, return it in an array.
   * If a folder with at least 1 valid item in it, return the array of valid items.
   * If a rolltable with at least 1 valid item in it, return the array of valid items.
   * If no valid items, return false.
   */
  static async validDrops(data) {
    const validItemTypes = [
      "weapon", "equipment",
      "consumable", "tool",
      "loot", "backpack"
    ];

    // must be either a folder of items, or an item.
    const isFolder = data.type === "Folder";
    const isItem = data.type === "Item";
    const isTable = data.type === "RollTable";

    if (!isFolder && !isItem && !isTable) {
      this.warning("SIMPLE_LOOT_LIST.WARNING.INVALID_DOCUMENT");
      return false;
    }

    // must have a uuid (it always has).
    if (!data.uuid) {
      this.warning("SIMPLE_LOOT_LIST.WARNING.MAJOR_ERROR")
      return false;
    }

    // the dropped document.
    const droppedDoc = await fromUuid(data.uuid);

    // case 1: single item.
    if (isItem) {
      // cannot be an owned item (uuid starts with 'Scene' or 'Actor').
      if (data.uuid.startsWith("Scene") || data.uuid.startsWith("Actor")) {
        this.warning("SIMPLE_LOOT_LIST.WARNING.ACTOR_ITEM");
        return false;
      }
      // must be valid item-type.
      if (!validItemTypes.includes(droppedDoc.type)) {
        this.warning("SIMPLE_LOOT_LIST.WARNING.INVALID_DOCUMENT", {
          type: droppedDoc.type
        });
        return false;
      }
      // return the item.
      return [droppedDoc];
    }

    // case 2: folder of items.
    if (isFolder) {
      // must be a folder of items.
      if (data.documentName !== "Item") {
        this.warning("SIMPLE_LOOT_LIST.WARNING.INVALID_DOCUMENT");
        return false;
      }
      // must have at least one valid item.
      const items = game.items.filter(i => {
        if (i.folder !== droppedDoc) return false;
        if (!validItemTypes.includes(i.type)) return false;
        return true;
      });
      if (!items.length) {
        this.warning("SIMPLE_LOOT_LIST.WARNING.EMPTY_DOCUMENT");
        return false;
      }
      // return the items.
      return items;
    }

    // case 3: rolltable.
    if (isTable) {
      // must have valid results embedded.
      const { DOCUMENT, COMPENDIUM } = CONST.TABLE_RESULT_TYPES;
      const uuids = droppedDoc.results.filter(i => {
        if (![DOCUMENT, COMPENDIUM].includes(i.type)) return false;
        if (!i.documentCollection) return false;
        return true;
      }).map(i => {
        const coll = i.documentCollection;
        const id = i.documentId;
        if (DOCUMENT === i.type) return `${coll}.${id}`;
        return `Compendium.${coll}.${id}`;
      });
      if (!uuids.length) {
        this.warning("SIMPLE_LOOT_LIST.WARNING.EMPTY_DOCUMENT");
        return false;
      }
      // get the items, then check if they are valid.
      const itemDocs = await Promise.all(uuids.map(i => {
        return fromUuid(i);
      }));
      const items = itemDocs.filter(item => {
        if (!item) return false;
        if (!validItemTypes.includes(item.type)) return false;
        return true;
      });
      if (!items.length) {
        this.warning("SIMPLE_LOOT_LIST.WARNING.EMPTY_DOCUMENT");
        return false;
      }
      // return the items.
      return items;
    }
  }

  // Finds duplicates in the loot list. Returns the node with the value if found, else false.
  static findDuplicates(html, uuid) {
    const found = html[0].querySelector(`.item-name[data-uuid="${uuid}"]`);
    if (!found) return false;
    return found.closest(".item").querySelector(".item-quantity > input");
  }

  // Appends +1 to a quantity in the html. Returns the new quantity.
  static appendQuantity(valueNode) {
    const value = valueNode.value + "+1";
    return dnd5e.dice.simplifyRollFormula(value);
  }

  // Create a new row from a uuid and name. Returns the row.
  static async createNewRow(uuid, name) {
    const template = "modules/simple-loot-list/templates/lootListRow.hbs";
    return renderTemplate(template, { value: 1, uuid, name });
  }

  // Create array of items from html. Returns the array.
  static getItemsFromHTML(html) {
    return [...html.querySelectorAll(".item")].reduce((acc, row) => {
      const quantity = row.querySelector(".item-quantity > input").value;
      const { dataset, innerText: name } = row.querySelector(".item-name");
      if (!dataset) return acc;
      const uuid = dataset.uuid;
      if (!quantity || !uuid) return acc;
      acc.push({ quantity, uuid, name });
      return acc;
    }, []);

  }

  // Create array of currencies. Returns the array.
  static getCurrenciesFromHTML(html) {
    const inputs = html.querySelectorAll(".currency-list input");
    return [...inputs].map(i => ({ key: i.dataset.key, value: i.value }));
  }

  // Update an actor with a loot list. If no array passed, remove flag.
  static async updateLootList(array, actor) {
    // if no array passed, unset the flag.
    if (!array || !array.length) {
      return actor.unsetFlag(MODULE, ITEMS);
    }

    // if array passed, update the actor flag.
    return actor.setFlag(MODULE, ITEMS, array);
  }

  // Get all the items on the loot list and add them to the target.
  static async grantLootToTarget(loot, currencies, targetUuid) {
    const { actor: target } = await fromUuid(targetUuid);
    const items = [];
    const update = {};
    const data = target.getRollData();

    for (const { quantity, uuid } of loot) {
      const item = await fromUuid(uuid);
      if (!item) {
        this.warning("SIMPLE_LOOT_LIST.WARNING.ITEM_NOT_FOUND", { uuid });
        continue;
      }
      const { total } = await new Roll(quantity, data).evaluate({ async: true });
      const itemData = item.toObject();
      itemData.system.quantity = total;
      items.push(itemData);
    }
    for (const { key, value } of currencies) {
      try {
        const { total } = await new Roll(value, data).evaluate({ async: true });
        update[`system.currency.${key}`] = target.system.currency[key] + total;
      } catch {}
    }
    await target.update(update);
    const created = await target.createEmbeddedDocuments("Item", items);
    this.warning("SIMPLE_LOOT_LIST.WARNING.CREATED_ITEMS", {
      amount: created.length,
      name: target.name
    }, "info");
    return created;
  }

  // helper warning method.
  static warning(string, obj = {}, type = "warn") {
    const locale = game.i18n.format(string, obj);
    ui.notifications[type](locale);
  }
}
