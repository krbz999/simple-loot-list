const MODULE = "simple-loot-list";

class LootList extends FormApplication {
  /**
   * Initialize module.
   */
  static init() {
    game.settings.register(MODULE, "headerLabel", {
      name: "SimpleLootList.SettingHeaderLabel",
      hint: "SimpleLootList.SettingHeaderLabelHint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false
    });

    Hooks.on("getActorSheetHeaderButtons", (app, array) => {
      if (!game.user.isGM) return;
      const listButton = {
        class: MODULE,
        icon: "fa-solid fa-coins",
        onclick: async () => new LootList(app.document).render(true),
        label: game.i18n.localize("SimpleLootList.Header")
      };
      const isV2 = ["ActorSheet5eCharacter2", "ActorSheet5eNPC2"].includes(app.constructor.name);
      if (!isV2 && !game.settings.get(MODULE, "headerLabel")) delete listButton.label;
      array.unshift(listButton);
    });

    game.modules.get(MODULE).api = {
      addItemsToActor: LootList.addItemsToActor
    };
  }

  /* -------------------------------------------------- */

  constructor(actor, options = {}) {
    super(actor, options);
    this.actor = actor;
    this.clone = actor.clone({}, {keepId: true});
  }

  /* -------------------------------------------------- */
  /*   Properties                                       */
  /* -------------------------------------------------- */

  /** @override */
  get title() {
    return game.i18n.format("SimpleLootList.Title", {name: this.actor.name});
  }

  /* -------------------------------------------------- */

  /** @override */
  get id() {
    return `${MODULE}-${this.actor.uuid.replaceAll(".", "-")}`;
  }

  /* -------------------------------------------------- */

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: [MODULE],
      template: "modules/simple-loot-list/module/module.hbs",
      dragDrop: [{dropSelector: "[data-action='drop']"}],
      scrollY: [".item-list"],
      width: 550,
      height: "auto"
    });
  }

  /* -------------------------------------------------- */

  /**
   * Get the item types that can have quantity and price.
   * @returns {Set<string>}     The valid item types.
   */
  static get validItemTypes() {
    return new Set(["weapon", "equipment", "consumable", "tool", "loot", "container"]);
  }

  /* -------------------------------------------------- */

  /**
   * Get the item types that can have quantity and price.
   * @returns {Set<string>}     The valid item types.
   */
  get validItemTypes() {
    return this.constructor.validItemTypes;
  }

  /* -------------------------------------------------- */
  /*   Rendering                                        */
  /* -------------------------------------------------- */

  /** @override */
  async getData(options = {}) {
    const currs = this._gatherCurrencies();
    return {
      lootItems: this._gatherItems().reduce((acc, data) => {
        const item = fromUuidSync(data.uuid ?? "");
        if (item) acc.push({...data, name: item.name});
        return acc;
      }, []).sort((a, b) => a.name.localeCompare(b.name)),
      currencies: Object.entries(CONFIG.DND5E.currencies).map(([key, vals]) => {
        return {key, value: currs[key] ?? 0, label: vals.label};
      })
    };
  }

  /* -------------------------------------------------- */
  /*   Event handlers                                   */
  /* -------------------------------------------------- */

  /** @override */
  async _onChangeInput(event) {
    const key = event.currentTarget.dataset.key;
    if (CONFIG.DND5E.currencies[key]) {
      const data = this._getSubmitData();
      this.clone.updateSource(data);
    } else {
      const uuid = event.currentTarget.closest("[data-uuid]").dataset.uuid;
      this._updateQuantity(uuid, event.currentTarget.value);
    }
    return this.render();
  }

  /* -------------------------------------------------- */

  /** @override */
  async _onDrop(event) {
    event.stopPropagation();
    event.target.closest("[data-action='drop']").classList.remove("drag-over");
    const data = TextEditor.getDragEventData(event);
    const items = await this._validateDrops(data);
    if (!items) return;

    for (const {uuid, name} of items) this._updateQuantity(uuid);
    this._warning("SimpleLootList.WarningAddedItems", {amount: items.length, name: this.clone.name}, "info");
    return this.render();
  }

  /* -------------------------------------------------- */

  /**
   * Update the quantity of an existing item on the list.
   * @param {string} uuid           The uuid of the item to update. Add it if not found.
   * @param {string} [quantity]     A specific value to set it to, otherwise add 1.
   */
  _updateQuantity(uuid, quantity = null) {
    const list = this._gatherItems();
    const existing = list.find(e => e.uuid === uuid);
    if (existing) existing.quantity = dnd5e.dice.simplifyRollFormula(quantity ? quantity : `${existing.quantity} + 1`);
    else list.push({quantity: quantity ? quantity : "1", uuid: uuid});
    this.clone.updateSource({[`flags.${MODULE}.loot-list`]: list});
  }

  /* -------------------------------------------------- */

  /** @override */
  async _onDragOver(event) {
    event.target.closest("[data-action='drop']")?.classList.add("drag-over");
  }

  /* -------------------------------------------------- */

  /** @override */
  async _updateObject() {
    const update = this.clone.flags[MODULE];
    return this.actor.update({[`flags.${MODULE}`]: update});
  }

  /* -------------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html[0].querySelectorAll("[data-action]").forEach(n => {
      switch (n.dataset.action) {
        case "delete": n.addEventListener("click", this._onClickItemDelete.bind(this)); break;
        case "render": n.addEventListener("click", this._onClickItemName.bind(this)); break;
        case "drop": n.addEventListener("dragleave", this._onDragLeaveBox.bind(this)); break;
        case "clear": n.addEventListener("click", this._onClickClear.bind(this)); break;
        case "grant": n.addEventListener("click", this._onClickGrant.bind(this)); break;
      }
    });
    html[0].querySelectorAll("input[type=text]").forEach(n => {
      n.addEventListener("focus", event => event.currentTarget.select());
    });
  }

  /* -------------------------------------------------- */

  /**
   * Grant the loot and currency list to the targeted token's actor.
   * @param {PointerEvent} event      The initiating click event.
   * @returns {Promise<void>}
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
    const itemUpdates = [];
    const update = {};
    const data = target.getRollData();
    let created = 0;

    const lootItemArray = await Promise.all(lootArray.map(async ({quantity, uuid}) => {
      return [quantity, uuid, await fromUuid(uuid)];
    }));

    for (const [quantity, uuid, item] of lootItemArray) {
      if (!item) {
        this._warning("SimpleLootList.WarningItemNotFound", {uuid});
        continue;
      }
      const {total} = await new Roll(quantity, data).evaluate();
      if (total < 1) continue;
      const itemData = game.items.fromCompendium(item);
      itemData.system.quantity = total;
      delete itemData.system.attuned;
      delete itemData.system.equipped;

      const existing = target.items.find(item => item._stats.compendiumSource === uuid);
      if (existing && ["loot", "consumable"].includes(existing.type)) {
        itemUpdates.push({_id: existing.id, "system.quantity": existing.system.quantity + itemData.system.quantity})
      } else items.push(itemData);
      created += itemData.system.quantity;
    }
    for (const [key, value] of Object.entries(currencies)) {
      try {
        const {total} = await new Roll(value, data).evaluate();
        update[`system.currency.${key}`] = target.system.currency[key] + Math.max(0, total);
      } catch (err) {
        console.warn(err);
      }
    }

    /**
     * A hook that is called before updates are performed.
     * @param {Actor} actor               The target to receive currencies and items.
     * @param {object} update             The update that will be performed on the target.
     * @param {object[]} itemUpdates      The updates to existing items.
     * @param {object[]} itemData         The item data for new items to be created.
     */
    Hooks.callAll("simple-loot-list.preGrantItems", target, update, itemUpdates, items);

    await target.update(update);
    await target.updateEmbeddedDocuments("Item", itemUpdates);
    await target.createEmbeddedDocuments("Item", items);
    this._warning("SimpleLootList.WarningCreatedItems", {amount: created, name: target.name}, "info");

    /**
     * A hook that is called after updates are performed.
     * @param {Actor} actor               The target to receive currencies and items.
     * @param {object} update             The update that will be performed on the target.
     * @param {object[]} itemUpdates      The updates to existing items.
     * @param {object[]} itemData         The item data for new items to be created.
     */
    Hooks.callAll("simple-loot-list.grantItems", target, update, itemUpdates, items);
  }

  /* -------------------------------------------------- */

  /**
   * Remove all items on the sheet. This does not stick unless saved.
   * @param {PointerEvent} event      The initiating click event.
   */
  _onClickClear(event) {
    const currencies = {};
    for (const key in CONFIG.DND5E.currencies) currencies[key] = 0;
    this.clone.updateSource({[`flags.${MODULE}`]: {"loot-list": [], currencies}});
    this.render();
  }

  /* -------------------------------------------------- */

  /**
   * Remove a single item on the sheet. This does not stick unless saved.
   * @param {PointerEvent} event      The initiating click event.
   */
  _onClickItemDelete(event) {
    const uuid = event.currentTarget.closest("[data-uuid]").dataset.uuid;
    const list = this._gatherItems();
    list.findSplice(i => i.uuid === uuid);
    this.clone.updateSource({[`flags.${MODULE}.loot-list`]: list});
    this.render();
  }

  /* -------------------------------------------------- */

  /**
   * Render an item sheet by clicking its name.
   * @param {PointerEvent} event      The initiating click event.
   */
  async _onClickItemName(event) {
    const item = await fromUuid(event.currentTarget.closest("[data-uuid]").dataset.uuid);
    item.sheet.render(true);
  }

  /* -------------------------------------------------- */

  /**
   * Remove the 'active' class from the drop area when left.
   * @param {DragEvent} event      The initiating drag event.
   */
  _onDragLeaveBox(event) {
    event.currentTarget.classList.remove("drag-over");
  }

  /* -------------------------------------------------- */

  /**
   * Read all items on the sheet.
   * @returns {object[]}      An array of objects with quantity, uuid, and name.
   */
  _gatherItems() {
    return foundry.utils.getProperty(this.clone, `flags.${MODULE}.loot-list`) ?? [];
  }

  /* -------------------------------------------------- */

  /**
   * Read all currencies on the sheet.
   * @returns {object}      An object with the currency keys and value (string).
   */
  _gatherCurrencies() {
    const curr = foundry.utils.getProperty(this.clone, `flags.${MODULE}.currencies`) ?? {};
    for (const k in curr) if (!(k in CONFIG.DND5E.currencies)) delete curr[k];
    return curr;
  }

  /* -------------------------------------------------- */

  /**
   * Helper method to display a warning for various reasons.
   * @param {string} string             The string to localize.
   * @param {object} [obj={}]           An object used to format the string.
   * @param {string} [type="warn"]      The type of notification.
   */
  _warning(string, obj = {}, type = "warn") {
    ui.notifications[type](game.i18n.format(string, obj));
  }

  /* -------------------------------------------------- */

  /**
   * Validate the dropped document and return an array of valid items from it.
   * If a single valid item, return it in an array.
   * If a folder with at least 1 valid item in it, return that array.
   * If a rolltable with at least 1 valid item in it, return that array.
   * If a compendium with at least 1 valid item in it, return that array.
   * If no valid items, returns false.
   * @param {object} data                     The dropped data object.
   * @returns {Promise<Item5e[]|boolean>}     The array of valid items, or false if none found.
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

  /* -------------------------------------------------- */

  /**
   * Validate a single dropped item.
   * @param {object} data                     The dropped item's data.
   * @returns {Promise<Item5e[]|boolean>}     The single dropped item in an array, or false if invalid.
   */
  async _dropSingleItem(data) {
    const item = await fromUuid(data.uuid);
    // Owned items are not allowed.
    if (item.parent instanceof Actor) {
      this._warning("SimpleLootList.WarningActorItem");
      return false;
    }

    // Must be a valid item type.
    if (!this.validItemTypes.has(item.type)) {
      this._warning("SimpleLootList.WarningInvalidDocument", {type: item.type});
      return false;
    }

    return [item];
  }

  /* -------------------------------------------------- */

  /**
   * Validate a folder of items.
   * @param {object} data                     The dropped folder's data.
   * @returns {Promise<Item5e[]|boolean>}     The array of valid items, or false if none found.
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
      return this.validItemTypes.has(item.type);
    });

    if (!items.length) {
      this._warning("SimpleLootList.WarningEmptyDocument");
      return false;
    }

    return items;
  }

  /* -------------------------------------------------- */

  /**
   * Validate a dropped rolltable.
   * @param {object} data                     The dropped table's data.
   * @returns {Promise<Item5e[]|boolean>}     The array of valid items, or false if none found.
   */
  async _dropRollTable(data) {
    const table = await fromUuid(data.uuid);
    const TYPES = CONST.TABLE_RESULT_TYPES;
    // Must have valid results embedded.
    const uuids = table.results.filter(result => {
      return [TYPES.DOCUMENT, TYPES.COMPENDIUM].includes(result.type) && !!result.documentCollection;
    }).map(result => {
      if (result.type === TYPES.DOCUMENT) return `${result.documentCollection}.${result.documentId}`;
      return `Compendium.${result.documentCollection}.Item.${result.documentId}`;
    });

    if (!uuids.length) {
      this._warning("SimpleLootList.WarningEmptyDocument");
      return false;
    }

    // Get the items and check validity.
    const promises = uuids.map(uuid => fromUuid(uuid));
    const resolved = await Promise.all(promises);
    const items = resolved.filter(r => this.validItemTypes.has(r?.type));

    if (!items.length) {
      this._warning("SimpleLootList.WarningEmptyDocument");
      return false;
    }

    return items;
  }

  /* -------------------------------------------------- */

  /**
   * Validate a dropped compendium.
   * @param {object} data                   The dropped pack's data.
   * @returns {Promise<Item[]|boolean>}     The array of valid items, or false if none found.
   */
  async _dropPack(data) {
    const pack = game.packs.get(data.id);
    if (pack.metadata.type !== "Item") {
      this._warning("SimpleLootList.WarningInvalidDocument");
      return false;
    }
    const index = await pack.getIndex({fields: ["system.quantity"]});
    const items = index.reduce((acc, item) => {
      if (!this.validItemTypes.has(item.type)) return acc;
      return acc.concat([{...item, quantity: item.system.quantity}]);
    }, []);
    if (!items.length) {
      this._warning("SimpleLootList.WarningEmptyDocument");
      return false;
    }
    return items;
  }

  /* -------------------------------------------------- */
  /*   Api methods                                      */
  /* -------------------------------------------------- */

  /**
   * Add items to the actor's loot list.
   * @param {Actor} actor           The actor with the loot list.
   * @param {Item[]} items          The items to add.
   * @returns {Promise<Actor>}      The updated actor.
   */
  static async addItemsToActor(actor, items) {
    items = items.filter(item => {
      return !item.isEmbedded && (item instanceof Item) && LootList.validItemTypes.has(item.type);
    });
    const current = foundry.utils.deepClone(actor.getFlag(MODULE, "loot-list") ?? []);
    for (const item of items) {
      const existing = current.find(e => e.uuid === item.uuid);
      if (existing) existing.quantity = dnd5e.dice.simplifyRollFormula(`${existing.quantity} + 1`);
      else current.push({quantity: "1", uuid: item.uuid});
    }
    return actor.setFlag(MODULE, "loot-list", current);
  }
}

Hooks.once("init", LootList.init);
