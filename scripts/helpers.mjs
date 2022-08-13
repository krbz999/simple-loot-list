export class SLL_HELPERS {

    /* 
        Returns an array of valid items from a dropped document.
        
        If single document, and it is valid, return it, wrapped
        in an array. If a folder, with at least 1 valid item in
        it, return the array of valid items.
        If no valid items, return false.
    */
    static async validDrops(data){
        console.log(data);
        const validItemTypes = [
            "weapon", "equipment", "consumable",
            "tool", "loot", "backpack"
        ];

        // must be either a folder of items, or an item.
        const isFolder = data.type === "Folder" && data.documentName === "Item";
        const isItem = data.type === "Item";
        const isTable = data.type === "RollTable";
        if(!isFolder && !isItem && !isTable){
            const warn = game.i18n.localize("SIMPLE_LOOT_LIST.WARNING.ONLY_ITEMS");
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
                const warn = game.i18n.format("SIMPLE_LOOT_LIST.WARNING.ITEM_TYPE", {
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

}