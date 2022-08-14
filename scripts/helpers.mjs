import { LOOT_LIST, MODULE_NAME } from "./const.mjs";

export class SLL_HELPERS {

    /* 
        Returns an array of valid items from a dropped document.
        
        If single document, and it is valid, return it, wrapped
        in an array. If a folder, with at least 1 valid item in
        it, return the array of valid items.
        If no valid items, return false.
    */
    static async validDrops(data){
        const validItemTypes = [
            "weapon", "equipment", "consumable",
            "tool", "loot", "backpack"
        ];

        // must be either a folder of items, or an item.
        const isFolder = data.type === "Folder";
        const isItem = data.type === "Item";
        const isTable = data.type === "RollTable";

        if(!isFolder && !isItem && !isTable){
            const warn = game.i18n.localize("SIMPLE_LOOT_LIST.WARNING.INVALID_DOCUMENT");
			ui.notifications.warn(warn);
            return false;
        }

        // must have a uuid (it always has).
		if(!data.uuid){
			const warn = game.i18n.localize("SIMPLE_LOOT_LIST.WARNING.MAJOR_ERROR");
			return ui.notifications.warn(warn);
		}

        // the dropped document.
        const droppedDoc = await fromUuid(data.uuid);

        // case 1: single item.
        if(isItem){
            // cannot be an owned item (uuid starts with 'Scene' or 'Actor').
		    if(data.uuid.startsWith("Scene") || data.uuid.startsWith("Actor")){
                const warn = game.i18n.localize("SIMPLE_LOOT_LIST.WARNING.ACTOR_ITEM");
                ui.notifications.warn(warn);
                return false;
            }
            // must be valid item-type.
            if(!validItemTypes.includes(droppedDoc.type)){
                const warn = game.i18n.format("SIMPLE_LOOT_LIST.WARNING.INVALID_DOCUMENT", {
                    type: droppedDoc.type
                });
                ui.notifications.warn(warn);
                return false;
            }
            // return the item.
            return [droppedDoc];
        }

        // case 2: folder of items.
        if(isFolder){
            // must be a folder of items.
            if(data.documentName !== "Item"){
                const warn = game.i18n.localize("SIMPLE_LOOT_LIST.WARNING.INVALID_DOCUMENT");
				ui.notifications.warn(warn);
                return false;
            }
            // must have at least one valid item.
            const items = game.items.filter(i => {
                if(i.folder !== droppedDoc) return false;
                if(!validItemTypes.includes(i.type)) return false;
                return true;
            });
            if(!items.length){
                const warn = game.i18n.localize("SIMPLE_LOOT_LIST.WARNING.EMPTY_DOCUMENT");
				ui.notifications.warn(warn);
                return false;
            }
            // return the items.
            return items;
        }

        // case 3: rolltable.
        if(isTable){
            // must have valid results embedded.
            const {DOCUMENT, COMPENDIUM} = CONST.TABLE_RESULT_TYPES;
            const uuids = droppedDoc.results.filter(i => {
                if(![DOCUMENT, COMPENDIUM].includes(i.type)) return false;
                if(!i.documentCollection) return false;
                return true;
            }).map(i => {
                const coll = i.documentCollection;
                const id = i.documentId;
                if(DOCUMENT === i.type) return `${coll}.${id}`;
                return `Compendium.${coll}.${id}`;
            });
            if(!uuids.length){
                const warn = game.i18n.localize("SIMPLE_LOOT_LIST.WARNING.EMPTY_DOCUMENT");
				ui.notifications.warn(warn);
                return false;
            }
            // get the items, then check if they are valid.
            const itemDocs = await Promise.all(uuids.map(i => {
                return fromUuid(i);
            }));
            const items = itemDocs.filter(i => {
                if(!i) return false;
                if(!validItemTypes.includes(i.type)) return false;
                return true;
            });
            if(!items.length){
                const warn = game.i18n.localize("SIMPLE_LOOT_LIST.WARNING.EMPTY_DOCUMENT");
				ui.notifications.warn(warn);
                return false;
            }
            // return the items.
            return items;
        }
    }

    /* 
        Finds duplicates in the loot list.
        Returns false if none found.
        Returns the node with the value if found.
    */
    static findDuplicates(html, uuid){
        const found = html[0].querySelector(`.SLL-item-name[data-uuid="${uuid}"]`);
        if(!found) return false;

        const row = found.closest(".SLL-item-row");
        const valueNode = row.querySelector(".SLL-item-quantity > input");
        return valueNode;
    }
    /*
        Appends +1 to a quantity in the html.
        Returns the new quantity.
    */
    static appendQuantity(valueNode){
        const value = valueNode.value + "+1";
        const additive = game.dnd5e.dice.simplifyRollFormula(value);
        return additive;
    }

    /*
        Create a new row from a uuid and name.
        Returns the row.
    */
    static async createNewRow(uuid, name){
        const template = "/modules/simple-loot-list/templates/lootListRow.html";
        const row = await renderTemplate(template, { value: 1, uuid, name });
        return row;
    }

    /*
        Create array of items from html.
        Return the items.
    */
    static getRowDataFromHTML(html){
        const lootArray = [];
        const rows = html.querySelectorAll(".SLL-item-row");
        for(let row of rows){
            const quantity = row.querySelector(".SLL-item-quantity > input").value;
            const {dataset, innerText: name} = row.querySelector("div.SLL-item-name");
            if(!dataset) continue;
            const {uuid} = dataset;
            if(!quantity || !uuid) continue;
            lootArray.push({quantity, uuid, name});
        }
        return lootArray;
    }

    /*
        Update an actor with a loot list.
        If no array passed, remove flag.
    */
    static async updateLootList(array, actor){
        // if no array passed, unset the flag.
        if(!array || !array.length){
            return actor.unsetFlag(MODULE_NAME, LOOT_LIST);
        }

        // if array passed, update the actor flag.
        return actor.setFlag(MODULE_NAME, LOOT_LIST, array);
    }

    /*
        Get all the items on the loot list and add them
        to the target. Return the list of items.
        Ui.notification too.
    */
    static async grantItemsToTarget(array, targetUuid){
        const {actor: target} = await fromUuid(targetUuid);
        const items = [];
        for(let {quantity, uuid} of array){
            const item = await fromUuid(uuid);
            const {total} = await new Roll(quantity, target.getRollData()).evaluate({async: true});
            const itemData = item.toObject();
            itemData.system.quantity = total;
            items.push(itemData);
        }
        const created = await target.createEmbeddedDocuments("Item", items);
        const info = game.i18n.format("SIMPLE_LOOT_LIST.WARNING.CREATED_ITEMS", {
            amount: created.length, name: target.name
        });
        ui.notifications.info(info);
        return created;
    }

}