import { MODULE_NAME, LOOT_LIST, MODULE_TITLE } from "./const.mjs";

export class LootList extends FormApplication {
	
	constructor(actor){
		super();
		this.actor = actor;
	}
	
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			closeOnSubmit: false,
			classes: ["sheet"],
			width: 550,
			template: "/modules/simple-loot-list/templates/lootListTemplate.html",
			height: "auto",
			dragDrop: [{ dragSelector: null, dropSelector: ".SLL-item-list-add" }],
			title: MODULE_TITLE
		});
	}

	get lootItems(){
		return this.actor.getFlag(MODULE_NAME, LOOT_LIST) ?? [];
	}

	async getData(options){
		let data = super.getData(options);
		data.lootItems = this.lootItems;
		data.labels = {
			DROP_ITEM: game.i18n.localize("SIMPLE_LOOT_LIST.LABEL.DROP_ITEM"),
			QUANTITY: game.i18n.localize("SIMPLE_LOOT_LIST.LABEL.QUANTITY"),
			ITEM: game.i18n.localize("SIMPLE_LOOT_LIST.LABEL.ITEM"),
			SAVE: game.i18n.localize("SIMPLE_LOOT_LIST.LABEL.SAVE"),
		}
		return data;
	}
	
	async _onDrop(event){
		event.stopPropagation();
		event.target.closest(".SLL-ondrop-box").classList.remove("drag-over");

		let data;
		try{
			data = JSON.parse(event.dataTransfer.getData("text/plain"));
		}
		catch(err){
			return false;
		}
		
		const {type, pack, id} = data;
		if(type !== "Item"){
			const warn = game.i18.localize("SIMPLE_LOOT_LIST.WARNING.ONLY_ITEMS");
			return ui.notifications.warn(warn);
		}
		if(!id){
			if(data.data?._id){
				const warn = game.i18n.localize("SIMPLE_LOOT_LIST.WARNING.ACTOR_ITEM");
				return ui.notifications.warn(warn);
			} 
			else{
				const warn = game.i18n.localize("SIMPLE_LOOT_LIST.WARNING.MAJOR_ERROR");
				return ui.notifications.warn(warn);
			}
		}
		
		const uuid = !!pack ? `Compendium.${pack}.${id}` : game.items.get(id).uuid;
		const item = await fromUuid(uuid);

		// must be valid item-type.
		const validItemTypes = ["weapon", "equipment", "consumable", "tool", "loot", "backpack"];
		if(!validItemTypes.includes(item.type)){
			const warn = game.i18n.format("SIMPLE_LOOT_LIST.WARNING.ITEM_TYPE", {type: item.type});
			return ui.notifications.warn(warn);
		}

		const list = this.element[0].querySelector("ol.SLL-item-list");

		// append:
		const newItem = document.createElement("li");
		newItem.classList.add("SLL-item-row", "flexrow");
		newItem.innerHTML = `
		<div class="SLL-item-quantity">
			<input type="text" value="1">
		</div>
		<div class="SLL-item-name" data-pack="${pack ?? ''}" data-id="${id}" data-uuid="${item.uuid}">${item.name}</div>
		<div class="SLL-item-delete">
			<a class="SLL-item-delete">
				<i class="fas fa-trash"></i>
			</a>
		</div>`;
		
		list.appendChild(newItem);
		this.setPosition();
	}

	async _onDragOver(event){
		const dropPoint = event.target.closest(".SLL-ondrop-box");
		if(!dropPoint) return;
		dropPoint.classList.add("drag-over");
	}

	async _updateObject(event, obj){
		event.stopPropagation();
		const html = event.target;

		// for each entry, add to object.
		const lootArray = [];
		const rows = html.querySelectorAll(".SLL-item-row");
		for(let row of rows){
			const quantity = row.querySelector(".SLL-item-quantity > input").value;
			const name = row.querySelector("div.SLL-item-name");
			if(!name) continue;
			
			const {uuid, pack, id} = name.dataset;
			if(!quantity || !id) continue;

			lootArray.push({quantity, pack, id, uuid, name: name.innerText});
		}
		
		await this.actor.setFlag(MODULE_NAME, LOOT_LIST, lootArray);
		this.close();
	}

	activateListeners(html){
		super.activateListeners(html);
		const app = this;
		html[0].addEventListener("click", async (event) => {
			const deleteButton = event.target.closest("div.SLL-item-delete");
			const itemName = event.target.closest("div.SLL-item-name");
			if(!!deleteButton){
				const row = deleteButton.closest("li.SLL-item-row");
				if(row){
					row.remove();
					app.setPosition();
				}
			}
			if(!!itemName){
				const {uuid, pack, id} = itemName.dataset;
				const item = !!uuid ? await fromUuid(uuid) : !!pack ? await fromUuid(`Compendium.${pack}.${id}`) : game.items.get(id);
				if(!item) return;
				return item.sheet.render(true);
			}
		});

		html[0].addEventListener("dragleave", (event) => {
			const dropPoint = event.target.closest(".SLL-ondrop-box");
			if(dropPoint){
				dropPoint.classList.remove("drag-over");
			}
		});
	}
}
