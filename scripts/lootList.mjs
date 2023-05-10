import {MODULE, ITEMS, CURRENCIES} from "./constants.mjs";

export class LootList extends FormApplication {
  constructor(actor) {
    super(actor);
    this.actor = actor;
  }

  /** @override */
  get id() {
    return `${MODULE}-${this.actor.id}`;
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: [MODULE],
      template: "modules/simple-loot-list/templates/lootListTemplate.hbs",
      dragDrop: [{dropSelector: "[data-action='drop']"}]
    });
  }

  /**
   * Get the item types that can have quantity and price.
   * @returns {string[]}      The array of item types.
   */
  get validItemTypes() {
    return ["weapon", "equipment", "consumable", "tool", "loot", "backpack"];
  }

  /** @override */
  async getData(options) {
    const data = await super.getData(options);
    const sll = this.actor.flags[MODULE] ?? {};

    // Get items.
    data.lootItems = sll[ITEMS] ?? [];
    data.lootItems.sort((a, b) => a.name.localeCompare(b.name));

    // Get currencies.
    const currs = sll[CURRENCIES] ?? {};
    data.currencies = [];
    for (const [key, vals] of Object.entries(CONFIG.DND5E.currencies)) {
      data.currencies.push({key: key, value: currs[key] ?? 0, label: vals.label});
    }

    return data;
  }

  /** @override */
  async _onDrop(event) {
    event.stopPropagation();
    event.target.closest("[data-action='drop']").classList.remove("drag-over");

    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    }
    catch (err) {
      return false;
    }
    const items = await this._validateDrops(data);
    if (!items) return;

    // append:
    const list = this.element[0].querySelector(".item-list");
    for (const {uuid, name} of items) {
      // find any current row with the same item.
      const found = this.element[0].querySelector(`[data-action="render"][data-uuid="${uuid}"]`);
      const valueNode = !found ? false : found.closest(".item").querySelector(".item-quantity > input");

      // if no node, create new row.
      if (!valueNode) {
        const div = document.createElement("DIV");
        const template = "modules/simple-loot-list/templates/lootListRow.hbs";
        div.innerHTML = await renderTemplate(template, {value: 1, uuid, name});
        div.querySelector("[data-action='render']").addEventListener("click", this._onClickItemName.bind(this));
        div.querySelector("[data-action='delete']").addEventListener("click", this._onClickItemDelete.bind(this));
        list.appendChild(div.firstChild);
      }
      // increase the value of the existing row.
      else {
        valueNode.value = dnd5e.dice.simplifyRollFormula(valueNode.value + "+1");
      }

    }
    if (items.length > 1) {
      this._warning("SimpleLootList.WarningAddedItems", {amount: items.length, name: this.actor.name}, "info");
    }
  }

  /** @override */
  async _onDragOver(event) {
    event.target.closest("[data-action='drop']")?.classList.add("drag-over");
  }

  /** @override */
  async _updateObject(event, formData) {
    formData[`flags.${MODULE}.${ITEMS}`] = this._gatherItems();
    return this.actor.update(formData);
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html[0].querySelectorAll("[data-action='delete']").forEach(n => n.addEventListener("click", this._onClickItemDelete.bind(this)));
    html[0].querySelectorAll("[data-action='render']").forEach(n => n.addEventListener("click", this._onClickItemName.bind(this)));
    html[0].querySelectorAll("[data-action='drop']").forEach(n => n.addEventListener("dragleave", this._onDragLeaveBox.bind(this)));
    html[0].querySelectorAll("[data-action='clear']").forEach(n => n.addEventListener("click", this._onClickClear.bind(this)));
    html[0].querySelectorAll("[data-action='grant']").forEach(n => n.addEventListener("click", this._onClickGrant.bind(this)));
  }

  /**
   * Grant the loot list to the targeted token's actor.
   * @param {PointerEvent} event      The initiating click event.
   * @returns {Item5e[]}              The created items.
   */
  async _onClickGrant(event) {
    const lootArray = this._gatherItems();
    const currencies = this._gatherCurrencies();
    const target = game.user.targets.first()?.actor;
    if (!target) {
      this._warning("SimpleLootList.WarningNoTarget");
      return;
    }

    const items = [];
    const update = {};
    const data = target.getRollData();

    for (const {quantity, uuid} of lootArray) {
      const item = await fromUuid(uuid);
      if (!item) {
        this._warning("SimpleLootList.WarningItemNotFound", {uuid});
        continue;
      }
      const {total} = await new Roll(quantity, data).evaluate();
      const itemData = game.items.fromCompendium(item);
      itemData.system.quantity = Math.max(1, total);
      if (itemData.system.attunement > 1) itemData.system.attunement = 1;
      delete itemData.system.equipped;
      delete itemData.system.proficient;
      items.push(itemData);
    }

    for (const {key, value} of currencies) {
      try {
        const {total} = await new Roll(value, data).evaluate();
        update[`system.currency.${key}`] = target.system.currency[key] + Math.max(0, total);
      } catch (err) {
        console.warn(err);
      }
    }

    await target.update(update);
    const created = await target.createEmbeddedDocuments("Item", items);
    this._warning("SimpleLootList.WarningCreatedItems", {amount: created.length, name: target.name}, "info");
    return created;
  }

  /**
   * Remove all items on the sheet. This does not stick unless saved.
   * @param {PointerEvent} event      The initiating click event.
   */
  _onClickClear(event) {
    this.element[0].querySelectorAll(".item").forEach(i => i.remove());
  }

  /**
   * Remove a single item on the sheet. This does not stick unless saved.
   * @param {PointerEvent} event      The initiating click event.
   */
  _onClickItemDelete(event) {
    event.currentTarget.closest(".item").remove();
  }

  /**
   * Render an item sheet by clicking its name.
   * @param {PointerEvent} event      The initiating click event.
   */
  async _onClickItemName(event) {
    const target = event.currentTarget;
    const item = await fromUuid(target.dataset.uuid);
    if (!item) this._warning("SimpleLootList.WarningItemNotFoundName", {name: target.innerText});
    else item.sheet.render(true);
  }

  /**
   * Remove the 'active' class from the drop area when left.
   * @param {DragEvent} event      The initiating drag event.
   */
  _onDragLeaveBox(event) {
    event.currentTarget.classList.remove("drag-over");
  }

  /**
   * Read all items on the sheet.
   * @returns {object[]}      An array of objects with quantity, uuid, and name.
   */
  _gatherItems() {
    const data = [];
    this.element[0].querySelectorAll(".item").forEach(n => {
      const quantity = n.querySelector(".item-quantity > input").value;
      const {dataset, innerText} = n.querySelector("[data-action='render']");
      if (!quantity) return;
      data.push({quantity, uuid: dataset.uuid, name: innerText});
    });
    return data;
  }

  /**
   * Read all currencies on the sheet.
   * @returns {object[]}      An array of objects with key and value.
   */
  _gatherCurrencies() {
    const data = [];
    this.element[0].querySelectorAll(".currency-list input").forEach(n => {
      data.push({key: n.dataset.key, value: n.value});
    });
    return data;
  }

  /**
   * Helper method to display a warning for various reasons.
   * @param {string} string             The string to localize.
   * @param {object} [obj={}]           An object used to format the string.
   * @param {string} [type="warn"]      The type of notification.
   */
  _warning(string, obj = {}, type = "warn") {
    ui.notifications[type](game.i18n.format(string, obj));
  }

  /**
   * Validate the dropped document and return an array of valid items from it.
   * If a single valid item, return it in an array.
   * If a folder with at least 1 valid item in it, return that array.
   * If a rolltable with at least 1 valid item in it, return that array.
   * If a compendium with at least 1 valid item in it, return that array.
   * If no valid items, returns false.
   * @param {object} data           The dropped data object.
   * @returns {Item5e[]|boolean}     The array of valid items, or false if none found.
   */
  async _validateDrops(data) {
    const isFolder = data.type === "Folder";
    const isItem = data.type === "Item";
    const isTable = data.type === "RollTable";
    const isPack = data.type === "Compendium";

    if (!isFolder && !isItem && !isTable && !isPack) {
      this._warning("SimpleLootList.WarningInvalidDocument");
      return false;
    }

    // Case 1: Single item dropped.
    if (isItem) return this._dropSingleItem(data);

    // Case 2: Folder of items dropped.
    if (isFolder) return this._dropFolder(data);

    // Case 3: RollTable dropped.
    if (isTable) return this._dropRollTable(data);

    // Case 4: Compendium dropped.
    if (isPack) return this._dropPack(data);
  }

  /**
   * Validate a single dropped item.
   * @param {object} data             The dropped item's data.
   * @returns {Item5e[]|boolean}      The single dropped item in an array, or false if invalid.
   */
  async _dropSingleItem(data) {
    const item = await fromUuid(data.uuid);
    // Owned items are not allowed.
    if (item.parent instanceof Actor) {
      this._warning("SimpleLootList.WarningActorItem");
      return false;
    }

    // Must be a valid item type.
    if (!this.validItemTypes.includes(item.type)) {
      this._warning("SimpleLootList.WarningInvalidDocument", {type: item.type});
      return false;
    }

    return [item];
  }

  /**
   * Validate a folder of items.
   * @param {object} data             The dropped folder's data.
   * @returns {Item5e[]|boolean}      The array of valid items, or false if none found.
   */
  async _dropFolder(data) {
    const folder = await fromUuid(data.uuid);
    // Must be a folder of items.
    if (folder.type !== "Item") {
      this._warning("SimpleLootList.WarningInvalidDocument");
      return false;
    }

    // Must have at least one valid item.
    const items = folder.contents.filter(item => {
      return this.validItemTypes.includes(item.type);
    });

    if (!items.length) {
      this._warning("SimpleLootList.WarningEmptyDocument");
      return false;
    }

    return items;
  }

  /**
   * Validate a dropped rolltable.
   * @param {object} data             The dropped table's data.
   * @returns {Item5e[]|boolean}      The array of valid items, or false if none found.
   */
  async _dropRollTable(data) {
    const table = await fromUuid(data.uuid);
    // Must have valid results embedded.
    const uuids = table.results.filter(result => {
      if (![
        CONST.TABLE_RESULT_TYPES.DOCUMENT,
        CONST.TABLE_RESULT_TYPES.COMPENDIUM
      ].includes(result.type)) return false;
      return !!result.documentCollection;
    }).map(result => {
      if (result.type === CONST.TABLE_RESULT_TYPES.DOCUMENT) {
        return `${result.documentCollection}.${result.documentId}`;
      }
      return `Compendium.${result.documentCollection}.${result.documentId}`;
    });

    if (!uuids.length) {
      this._warning("SimpleLootList.WarningEmptyDocument");
      return false;
    }

    // Get the items and check validity.
    let items = await Promise.all(uuids.map(uuid => fromUuid(uuid)));
    items = items.filter(item => (!item || !this.validItemTypes.includes(item.type)));

    if (!items.length) {
      this._warning("SimpleLootList.WarningEmptyDocument");
      return false;
    }

    return items;
  }

  /**
   * Validate a dropped compendium.
   * @param {object} data           The dropped pack's data.
   * @returns {Item[]|boolean}      The array of valid items, or false if none found.
   */
  async _dropPack(data) {
    const pack = game.packs.get(data.id);
    if (pack.metadata.type !== "Item") {
      this._warning("SimpleLootList.WarningInvalidDocument");
      return false;
    }
    const index = await pack.getIndex({fields: ["system.quantity"]});
    const items = index.reduce((acc, item) => {
      if (!this.validItemTypes.includes(item.type)) return acc;
      acc.push({
        quantity: item.system.quantity,
        name: item.name,
        uuid: `Compendium.${data.id}.Item.${item._id}`
      });
      return acc;
    }, []);
    if (!items.length) {
      this._warning("SimpleLootList.WarningEmptyDocument");
      return false;
    }
    return items;
  }
}
