import { MODULE_NAME, LOOT_LIST } from "./const.mjs";
import { SLL_HELPERS } from "./helpers.mjs";

export class LootList extends FormApplication {
    
    constructor(actor){
        super(actor);
        this.actor = actor;
    }

    get id(){
        return `simple-loot-list-${this.actor.id}`;
    }
    
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            closeOnSubmit: false,
            classes: ["sheet"],
            width: 550,
            template: "/modules/simple-loot-list/templates/lootListTemplate.html",
            height: "auto",
            dragDrop: [{ dragSelector: null, dropSelector: ".SLL-item-list-add" }]
        });
    }

    get lootItems(){
        return this.actor.getFlag(MODULE_NAME, LOOT_LIST) ?? [];
    }

    async getData(options){
        let data = super.getData(options);
        data.lootItems = this.lootItems;
        return data;
    }
    
    async _onDrop(event){
        event.stopPropagation();
        event.target.closest(".SLL-ondrop-box").classList.remove("drag-over");

        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData("text/plain"));
        }
        catch ( err ) {
            return false;
        }
        const items = await SLL_HELPERS.validDrops(data);
        if ( !items ) return;

        // append:
        const list = this.element[0].querySelector("ol.SLL-item-list");
        for ( const { uuid, name } of items ) {
            // find any current row with the same item.
            const valueNode = SLL_HELPERS.findDuplicates(this.element, uuid);

            // if no node, create new row.
            if ( !valueNode ) {
                const div = document.createElement("DIV");
                div.innerHTML = await SLL_HELPERS.createNewRow(uuid, name);
                list.appendChild(div.firstChild);
            }
            // increase the value of the existing row.
            else {
                valueNode.value = SLL_HELPERS.appendQuantity(valueNode);
            }
            
        }
        if ( items.length > 1 ) {
            const string = "SIMPLE_LOOT_LIST.WARNING.ADDED_ITEMS_TO_LIST";
            const locale = game.i18n.format(string, {
                amount: items.length,
                name: this.actor.name
            });
            ui.notifications.info(locale);
        }
        this.setPosition();
    }

    async _onDragOver(event){
        const dropPoint = event.target.closest(".SLL-ondrop-box");
        if ( !dropPoint ) return;
        dropPoint.classList.add("drag-over");
    }

    async _updateObject(event, obj){
        event.stopPropagation();
        const html = event.target;
        const button = event.submitter;
        if ( !button ) return;

        // delete the list.
        if ( button.name === "clear" ) {
            const rows = html.querySelectorAll("li.SLL-item-row");
            for ( const li of rows ) li.remove();
            this.setPosition();
            return;
        }
        // just close, don't save.
        if ( button.name === "cancel" ) return this.close();
        // if grant, must have target.
        if ( button.name === "grant" ) {
            const target = game.user.targets.first().document.uuid;
            const lootArray = SLL_HELPERS.getRowDataFromHTML(html);
            return SLL_HELPERS.grantItemsToTarget(lootArray, target);
        }
        // if not one of the above, should be 'submit'.
        if ( button.name !== "submit" ) return;

        // for each entry, add to object.
        const lootArray = SLL_HELPERS.getRowDataFromHTML(html);
        await SLL_HELPERS.updateLootList(lootArray, this.actor);
        this.close();
    }

    activateListeners(html){
        super.activateListeners(html);
        const app = this;
        html[0].addEventListener("click", async (event) => {
            const deleteButton = event.target.closest("div.SLL-item-delete");
            const itemName = event.target.closest("div.SLL-item-name");
            if ( !!deleteButton ) {
                const row = deleteButton.closest("li.SLL-item-row");
                if ( row ) {
                    row.remove();
                    app.setPosition();
                }
            }
            if ( !!itemName ) {
                const { uuid } = itemName.dataset;
                const item = await fromUuid(uuid);
                if ( !item ) {
                    const warning = "SIMPLE_LOOT_LIST.WARNING.NO_SUCH_ITEM";
                    const locale = game.i18n.format(warning, {
                        name: itemName.innerText
                    });
                    ui.notifications.warn(locale);
                    return;
                }
                return item.sheet.render(true);
            }
        });

        html[0].addEventListener("dragleave", (event) => {
            const dropPoint = event.target.closest(".SLL-ondrop-box");
            if ( dropPoint ) {
                dropPoint.classList.remove("drag-over");
            }
        });
    }
}
